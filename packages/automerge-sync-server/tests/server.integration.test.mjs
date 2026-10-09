import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { Repo, cbor, generateAutomergeUrl } from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import WebSocket from "ws";
import {
  decodeSyncState,
  getHeads as automergeHeads,
} from "@automerge/automerge";
import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
} from "../../core/dist/index.js";
import { RepoPerTaskDocuments } from "../../store-automerge/dist/index.js";
import { PerTaskRepository } from "../../store-shared/dist/perTaskRepository.js";
import { AuthenticatedWebSocketNetworkAdapter } from "../../app/src/sync/AuthenticatedWebSocketNetworkAdapter.ts";
import {
  AtomicNodeFSStorageAdapter,
  HostedSyncService,
  InMemoryHostedVaultAccountStore,
  MemorySafeLogger,
  accountStorageDirectory,
} from "../dist/index.js";

const allowedOrigin = "https://app.example.test";
const temporaryDirectories = [];
const services = [];
const repos = [];

afterEach(async () => {
  await Promise.allSettled(repos.splice(0).map((repo) => repo.shutdown()));
  await Promise.allSettled(
    services.splice(0).map((service) => service.shutdown()),
  );
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test(
  "server-created empty roots are durable before concurrent sticky binding and survive volume restore",
  async () => {
    const storageRoot = await temporaryDirectory();
    const accounts = new InMemoryHostedVaultAccountStore([hostedAccount()]);
    const bind = accounts.bindOrResolveRoot.bind(accounts);
    let durableProposals = 0;
    accounts.bindOrResolveRoot = async (input) => {
      // Probe ordinary files with an independent Repo before publishing the binding.
      // An in-memory handle on the server cannot make this check pass.
      const probe = new Repo({
        storage: new AtomicNodeFSStorageAdapter(
          accountStorageDirectory(storageRoot, "account-a"),
        ),
        network: [],
      });
      let vault;
      try {
        vault = await PerTaskRepository.open(
          new RepoPerTaskDocuments(probe),
          input.proposedRootDocumentURL,
        );
        const logical = await vault.readLogicalVault();
        assert.equal(logical.vaultID, "account-a");
        assert.deepEqual(logical.tasks, {});
        assert.deepEqual(logical.observations, {});
        assert.deepEqual(logical.attachments, {});
        durableProposals++;
      } finally {
        await vault?.close();
        await probe.shutdown();
      }
      return bind(input);
    };
    const first = await startFixture([], {
      storageRoot,
      accountStore: accounts,
    });
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        control(first.httpOrigin, "/v1/hosted-roots:resolve", {}),
      ),
    );
    assert.ok(responses.every(({ status }) => status === 200));
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    assert.ok(durableProposals >= 1);
    assert.equal(
      new Set(results.map(({ rootDocumentURL }) => rootDocumentURL)).size,
      1,
    );
    const rootURL = results[0].rootDocumentURL;
    const proposalsAfterFirstResolve = durableProposals;
    const sticky = await control(
      first.httpOrigin,
      "/v1/hosted-roots:resolve",
      {},
    );
    assert.deepEqual(await sticky.json(), results[0]);
    assert.equal(durableProposals, proposalsAfterFirstResolve);
    const persistedAccount = await accounts.getBySubject("user-a");
    assert.equal(persistedAccount.root.documentURL, rootURL);
    await first.service.shutdown();
    services.splice(services.indexOf(first.service), 1);

    const restoredRoot = await temporaryDirectory();
    await fs.cp(storageRoot, restoredRoot, { recursive: true });
    const restored = await startFixture([persistedAccount], {
      storageRoot: restoredRoot,
    });
    assert.deepEqual(
      await (
        await control(restored.httpOrigin, "/v1/hosted-roots:resolve", {})
      ).json(),
      results[0],
    );
    const reader = clientRepo(
      await temporaryDirectory(),
      "server-created-root",
    );
    const network = attachAuthenticatedNetwork(
      reader,
      restored.websocketURL,
      "valid",
    );
    await withTimeout(
      network.network.whenReady(),
      10_000,
      "server-created root peer",
    );
    const vault = await withTimeout(
      PerTaskRepository.open(new RepoPerTaskDocuments(reader), rootURL),
      10_000,
      "restored empty vault",
    );
    assert.equal((await vault.readLogicalVault()).vaultID, "account-a");
    assert.deepEqual(await vault.getReviewQueue(0), []);
    await vault.close();
  },
  { timeout: 30_000 },
);

test("a real Repo storage failure cannot bind a new account root", async () => {
  const fixture = await startFixture([hostedAccount()], {
    maximumStorageBytesPerAccount: 200,
  });
  const response = await control(
    fixture.httpOrigin,
    "/v1/hosted-roots:resolve",
    {},
  );
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "service-unavailable" });
  assert.equal(
    (await fixture.accounts.getBySubject("user-a")).root.status,
    "unbound",
  );
  // Storage metadata fits; the catalog's first Repo flush is what exceeds quota.
  assert.equal((await fixture.service.metrics()).loadedAccountRepos, 1);
});

test("control routes require revocation-checked ID POSTs and exact CORS", async () => {
  const fixture = await startFixture([hostedAccount()]);
  const [first, second] = await Promise.all([
    control(fixture.httpOrigin, "/v1/hosted-roots:resolve", {}),
    control(fixture.httpOrigin, "/v1/hosted-roots:resolve", {}),
  ]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const responses = [await first.json(), await second.json()];
  assert.equal(responses[0].rootDocumentURL, responses[1].rootDocumentURL);
  assert.equal(responses[0].accountID, "account-a");
  assert.deepEqual(
    await (
      await control(fixture.httpOrigin, "/v1/hosted-roots:resolve", {})
    ).json(),
    {
      accountID: "account-a",
      rootDocumentURL: responses[0].rootDocumentURL,
    },
  );

  assert.equal(
    (
      await control(fixture.httpOrigin, "/v1/hosted-roots:bind-or-resolve", {
        proposedRootDocumentURL: generateAutomergeUrl(),
      })
    ).status,
    404,
  );

  const pat = await control(
    fixture.httpOrigin,
    "/v1/hosted-roots:resolve",
    {},
    {
      authorization: "Token legacy-personal-access-token",
    },
  );
  assert.equal(pat.status, 401);
  const queryCredential = await fetch(
    `${fixture.httpOrigin}/v1/hosted-roots:resolve?idToken=valid`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  assert.equal(queryCredential.status, 404);
  const wrongOrigin = await control(
    fixture.httpOrigin,
    "/v1/hosted-roots:resolve",
    {},
    { origin: "https://attacker.example" },
  );
  assert.equal(wrongOrigin.status, 403);
  const preflight = await fetch(
    `${fixture.httpOrigin}/v1/hosted-roots:resolve`,
    {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      },
    },
  );
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    allowedOrigin,
  );
  const extraHeaderPreflight = await fetch(
    `${fixture.httpOrigin}/v1/hosted-roots:resolve`,
    {
      method: "OPTIONS",
      headers: {
        Origin: allowedOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, x-surprise",
      },
    },
  );
  assert.equal(extraHeaderPreflight.status, 403);
  const metricsResponse = await fetch(`${fixture.httpOrigin}/_metrics`);
  assert.equal(metricsResponse.status, 200);
  const metricsText = await metricsResponse.text();
  assert.match(metricsText, /"loadedAccountRepos":/);
  assert.doesNotMatch(metricsText, /user-a|example\.test|automerge:/);

  const metricsHidden = await startFixture([hostedAccount()], {
    exposeMetrics: false,
  });
  assert.equal(
    (await fetch(`${metricsHidden.httpOrigin}/_metrics`)).status,
    404,
  );

  // No client can reclaim reminder authority through the retired endpoint.
  const before = await fixture.accounts.getBySubject("user-a");
  assert.equal(
    (
      await control(fixture.httpOrigin, "/v1/notification-plans", {
        plan: {},
      })
    ).status,
    404,
  );
  assert.deepEqual(await fixture.accounts.getBySubject("user-a"), before);

  const legacy = await startFixture([
    hostedAccount({
      authSubject: "legacy-user",
      migration: { mode: "legacy" },
      notificationMode: "legacy",
    }),
  ]);
  assert.equal(
    (await control(legacy.httpOrigin, "/v1/hosted-roots:resolve", {})).status,
    409,
  );
});

test("WebSocket admission verifies a first-frame Firebase token and contains bad input", async () => {
  const root = generateAutomergeUrl();
  const fixture = await startFixture([
    hostedAccount({
      root: {
        status: "bound",
        documentURL: root,
        boundAtTimestampMillis: Date.now(),
      },
    }),
  ]);
  const socket = await openSocket(fixture.websocketURL);
  const firstMessage = nextMessage(socket);
  socket.send(admission("valid"));
  const accepted = JSON.parse(String(await firstMessage));
  assert.deepEqual(accepted, {
    type: "orbit-sync-admission-accepted",
    protocolVersion: 1,
  });
  socket.send(new Uint8Array([0xff, 0x00, 0x13]));
  await eventually(
    async () => (await fetch(`${fixture.httpOrigin}/_health`)).status === 200,
  );

  const reused = await openSocket(fixture.websocketURL);
  const reusedAdmission = nextMessage(reused);
  reused.send(admission("valid"));
  assert.equal(
    JSON.parse(String(await reusedAdmission)).type,
    "orbit-sync-admission-accepted",
  );
  reused.terminate();

  await assert.rejects(
    openSocket(`${fixture.websocketURL}?idToken=valid`),
    /Upgrade rejected: 401/,
  );
  const malformed = await openSocket(fixture.websocketURL);
  const malformedClose = nextClose(malformed);
  malformed.send(new Uint8Array([1, 2, 3]));
  assert.equal((await malformedClose).code, 1008);

  socket.terminate();
  const logged = fixture.logger.lines.join("\n");
  assert.doesNotMatch(logged, new RegExp(root));
  assert.doesNotMatch(logged, /valid/);
});

test("admission checks revocation and bounds socket lifetime", async () => {
  const fixture = await startFixture([boundAccount("user-a", "account-a")], {
    maximumSocketLifetimeMillis: 120,
  });
  fixture.verifier.revokedSubjects.add("user-a");
  const revoked = await openSocket(fixture.websocketURL);
  const revokedClose = nextClose(revoked);
  revoked.send(admission("valid"));
  assert.equal((await revokedClose).code, 1008);

  fixture.verifier.revokedSubjects.clear();
  const admitted = await openSocket(fixture.websocketURL);
  const admittedMessage = nextMessage(admitted);
  admitted.send(admission("valid"));
  assert.equal(
    JSON.parse(String(await admittedMessage)).type,
    "orbit-sync-admission-accepted",
  );
  assert.equal((await nextClose(admitted)).code, 4001);

  const replacement = await openSocket(fixture.websocketURL);
  const replacementMessage = nextMessage(replacement);
  replacement.send(admission("valid"));
  assert.equal(
    JSON.parse(String(await replacementMessage)).type,
    "orbit-sync-admission-accepted",
  );
  replacement.terminate();
});

test("an account socket cap rejects an otherwise valid credential", async () => {
  const fixture = await startFixture([boundAccount("user-a", "account-a")], {
    maximumSocketsPerAccount: 1,
  });
  const first = await openSocket(fixture.websocketURL);
  const firstAdmission = nextMessage(first);
  first.send(admission("valid"));
  assert.equal(
    JSON.parse(String(await firstAdmission)).type,
    "orbit-sync-admission-accepted",
  );

  const second = await openSocket(fixture.websocketURL);
  const secondClose = nextClose(second);
  second.send(admission("valid"));
  assert.equal((await secondClose).code, 1008);
  assert.equal((await fixture.service.metrics()).capacityRejections, 1);
  first.terminate();
});

test("native and browser admission deadlines contain stalled authentication and late results", async (t) => {
  for (const mode of ["native", "browser"]) {
    for (const stage of ["verification", "account lookup"]) {
      for (const result of ["resolve", "reject"]) {
        await t.test(`${mode}: late ${stage} ${result}`, async () => {
          const fixture = await startFixture(
            [boundAccount("user-a", "account-a")],
            {
              admissionTimeoutMillis: 100,
            },
          );
          let settle;
          const pending = new Promise((resolve, reject) => {
            settle = () =>
              result === "resolve"
                ? resolve()
                : reject(new Error("Late authentication failure"));
          });
          let entered = false;
          let finished = false;
          const owner =
            stage === "verification" ? fixture.verifier : fixture.accounts;
          const method =
            stage === "verification" ? "verifyIDToken" : "getBySubject";
          const original = owner[method].bind(owner);
          owner[method] = async (...args) => {
            entered = true;
            try {
              await pending;
              return await original(...args);
            } finally {
              finished = true;
            }
          };
          const socket = await openSocket(
            fixture.websocketURL,
            mode === "native"
              ? {
                  headers: nativeAdmissionHeaders("valid"),
                  origin: null,
                }
              : {},
          );
          const messages = [];
          socket.on("message", (data) => messages.push(data));
          const closed = nextClose(socket);
          if (mode === "browser") socket.send(admission("valid"));
          else
            socket.send(
              cbor.encode({
                type: "join",
                senderId: "stalled-native",
                supportedProtocolVersions: "1",
              }),
            );
          try {
            await eventually(() => entered);
            assert.equal(
              (await withTimeout(closed, 1_000, "admission deadline")).code,
              1008,
            );
            await eventually(
              async () =>
                (await fixture.service.metrics()).sockets.activeSockets === 0,
            );
            settle();
            await eventually(() => finished);
            // Let the authentication rejection/success continuation run too.
            await new Promise((resolve) => setImmediate(resolve));
            const metrics = await fixture.service.metrics();
            assert.equal(metrics.sockets.acceptedSockets, 0);
            assert.equal(metrics.sockets.rejectedSockets, 1);
            assert.equal(metrics.loadedAccountRepos, 0);
            assert.deepEqual(messages, []);
          } finally {
            socket.terminate();
            settle();
          }
        });
      }
    }
  }
});

test("native and browser admission accept delayed verification and clear their deadlines", async (t) => {
  for (const mode of ["native", "browser"]) {
    await t.test(mode, async () => {
      const fixture = await startFixture(
        [boundAccount("user-a", "account-a")],
        {
          admissionTimeoutMillis: 500,
        },
      );
      const verify = fixture.verifier.verifyIDToken.bind(fixture.verifier);
      fixture.verifier.verifyIDToken = async (token) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return verify(token);
      };
      const socket = await openSocket(
        fixture.websocketURL,
        mode === "native"
          ? {
              headers: nativeAdmissionHeaders("valid"),
              origin: null,
            }
          : {},
      );
      const response = nextMessage(socket);
      const join = cbor.encode({
        type: "join",
        senderId: `delayed-${mode}`,
        supportedProtocolVersions: "1",
      });
      if (mode === "browser") {
        socket.send(admission("valid"));
        assert.equal(
          JSON.parse(
            String(await withTimeout(response, 1_000, "browser admission")),
          ).type,
          "orbit-sync-admission-accepted",
        );
        const peer = nextMessage(socket);
        socket.send(join);
        assert.equal(
          cbor.decode(
            new Uint8Array(await withTimeout(peer, 1_000, "browser peer")),
          ).type,
          "peer",
        );
      } else {
        // The native join arrives while the verifier is still pending.
        socket.send(join);
        assert.equal(
          cbor.decode(
            new Uint8Array(await withTimeout(response, 1_000, "native peer")),
          ).type,
          "peer",
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      const metrics = await fixture.service.metrics();
      assert.equal(socket.readyState, WebSocket.OPEN);
      assert.equal(metrics.sockets.acceptedSockets, 1);
      assert.equal(metrics.sockets.rejectedSockets, 0);
      assert.equal(metrics.sockets.activeSockets, 1);
      socket.terminate();
    });
  }
});

test("native header admission passes Repo Swift's join through unchanged", async () => {
  const root = generateAutomergeUrl();
  const oversizedToken = "x".repeat(8_193);
  const fixture = await startFixture(
    [boundAccount("user-a", "account-a", root)],
    {
      principals: {
        valid: principalFor("user-a"),
        [oversizedToken]: principalFor("user-a"),
      },
    },
  );
  const headers = nativeAdmissionHeaders("valid");
  const socket = await openSocket(fixture.websocketURL, { headers });
  const peerMessage = nextMessage(socket);
  await eventually(
    async () => (await fixture.service.metrics()).sockets.acceptedSockets === 1,
  );

  // Repo Swift 0.3.2 sends protocol version "1" as a scalar rather than the
  // one-element array emitted by Repo's TypeScript WebSocket adapter.
  socket.send(
    cbor.encode({
      type: "join",
      senderId: "orbit-repo-swift-integration",
      supportedProtocolVersions: "1",
      peerMetadata: {
        storageId: "orbit-native-storage-integration",
        isEphemeral: false,
      },
    }),
  );
  const peer = cbor.decode(
    new Uint8Array(
      await withTimeout(peerMessage, 5_000, "Repo Swift peer frame"),
    ),
  );
  assert.equal(peer.type, "peer");
  assert.equal(peer.targetId, "orbit-repo-swift-integration");
  assert.equal(peer.selectedProtocolVersion, "1");
  assert.equal(typeof peer.peerMetadata.storageId, "string");

  const reused = await openSocket(fixture.websocketURL, { headers });
  const reusedPeerMessage = nextMessage(reused);
  reused.send(
    cbor.encode({
      type: "join",
      senderId: "orbit-repo-swift-reused-token",
      supportedProtocolVersions: "1",
      peerMetadata: {
        storageId: "orbit-native-storage-reused-token",
        isEphemeral: false,
      },
    }),
  );
  assert.equal(
    cbor.decode(
      new Uint8Array(
        await withTimeout(reusedPeerMessage, 5_000, "reused-token peer frame"),
      ),
    ).peerMetadata.storageId,
    peer.peerMetadata.storageId,
  );
  reused.terminate();
  socket.terminate();

  await assert.rejects(
    openSocket(fixture.websocketURL, {
      headers: { "X-Orbit-Sync-Ticket": "legacy-ticket" },
      origin: null,
    }),
    /Upgrade rejected: 401/,
  );
  await assert.rejects(
    openSocket(fixture.websocketURL, {
      headers: nativeAdmissionHeaders(oversizedToken),
      origin: null,
    }),
    /Upgrade rejected: 401/,
  );
});

test(
  "native header admission exchanges Repo changes in both directions",
  async () => {
    const rootRepo = clientRepo(await temporaryDirectory(), "native-source");
    const rootHandle = rootRepo.create({ value: "from web Repo" });
    const fixture = await startFixture([
      boundAccount("user-a", "account-a", rootHandle.url),
    ]);
    const sourceNetwork = attachAuthenticatedNetwork(
      rootRepo,
      fixture.websocketURL,
      "valid",
    );
    await withTimeout(sourceNetwork.network.whenReady(), 10_000, "source peer");
    await waitForRemoteHeads(rootHandle, sourceNetwork.remoteStorageID);

    const restoreWebSocket = installNativeHeaderWebSocket("valid");
    const nativeRepo = clientRepo(await temporaryDirectory(), "native-header");
    const nativeNetwork = new WebSocketClientAdapter(
      fixture.websocketURL,
      60_000,
    );
    try {
      nativeRepo.networkSubsystem.addNetworkAdapter(nativeNetwork);
      await withTimeout(nativeNetwork.whenReady(), 10_000, "native peer");
      await eventually(() => nativeNetwork.remotePeerId !== undefined, 5_000);
      const nativeHandle = await nativeRepo.find(rootHandle.url);
      assert.equal(nativeHandle.doc().value, "from web Repo");

      nativeHandle.change((doc) => {
        doc.nativeValue = "from native Repo";
      });
      await eventually(
        () => rootHandle.doc().nativeValue === "from native Repo",
        10_000,
      );

      rootHandle.change((doc) => {
        doc.webValue = "back to native";
      });
      await eventually(
        () => nativeHandle.doc().webValue === "back to native",
        10_000,
      );
    } finally {
      nativeNetwork.disconnect();
      restoreWebSocket();
    }
  },
  { timeout: 30_000 },
);

test(
  "Repo sync survives volume restore and structurally isolates accounts",
  async () => {
    const storageRoot = await temporaryDirectory();
    const rootRepo = clientRepo(await temporaryDirectory(), "source");
    const rootHandle = rootRepo.create({ value: "survives restart" });
    await rootRepo.flush([rootHandle.documentId]);

    const accountA = boundAccount("user-a", "account-a", rootHandle.url);
    // Deliberately bind B to the same URL. Its private Repo prefix must still
    // prevent it from seeing A's bytes.
    const accountB = boundAccount("user-b", "account-b", rootHandle.url);
    const principals = {
      "token-a": principalFor("user-a"),
      "token-b": principalFor("user-b"),
    };
    const first = await startFixture([accountA, accountB], {
      storageRoot,
      principals,
      idleRepoTimeoutMillis: 100,
    });
    const sourceNetwork = attachAuthenticatedNetwork(
      rootRepo,
      first.websocketURL,
      "token-a",
    );
    await withTimeout(sourceNetwork.network.whenReady(), 10_000, "source peer");
    await waitForRemoteHeads(rootHandle, sourceNetwork.remoteStorageID);

    rootRepo.networkSubsystem.removeNetworkAdapter(sourceNetwork.network);
    sourceNetwork.network.disconnect();
    await first.service.shutdown();
    services.splice(services.indexOf(first.service), 1);

    const restoredRoot = await temporaryDirectory();
    await fs.cp(storageRoot, restoredRoot, { recursive: true });
    const second = await startFixture([accountA, accountB], {
      storageRoot: restoredRoot,
      principals,
    });
    const freshRepo = clientRepo(await temporaryDirectory(), "fresh");
    const freshNetwork = attachAuthenticatedNetwork(
      freshRepo,
      second.websocketURL,
      "token-a",
    );
    await withTimeout(
      freshNetwork.network.whenReady(),
      10_000,
      "restored peer",
    );
    const loaded = await freshRepo.find(rootHandle.url, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(loaded.doc().value, "survives restart");

    const isolatedRepo = clientRepo(await temporaryDirectory(), "isolated");
    const isolatedNetwork = attachAuthenticatedNetwork(
      isolatedRepo,
      second.websocketURL,
      "token-b",
    );
    await withTimeout(
      isolatedNetwork.network.whenReady(),
      10_000,
      "isolated peer",
    );
    await assert.rejects(
      isolatedRepo.find(rootHandle.url, {
        signal: AbortSignal.timeout(400),
      }),
    );
  },
  { timeout: 30_000 },
);

test(
  "offline replicas preserve durability and convergence through server restart",
  async () => {
    const storageRoot = await temporaryDirectory();
    const account = boundAccount("user-a", "account-a");
    const first = await startFixture([account], { storageRoot });

    const firstRepo = clientRepo(await temporaryDirectory(), "offline-first");
    const firstHandle = firstRepo.create({
      sharedBase: "present before disconnection",
    });
    account.root = {
      status: "bound",
      documentURL: firstHandle.url,
      boundAtTimestampMillis: Date.now(),
    };
    const firstNetwork = attachAuthenticatedNetwork(
      firstRepo,
      first.websocketURL,
      "valid",
    );
    await withTimeout(firstNetwork.network.whenReady(), 10_000, "first peer");
    await waitForRemoteHeads(firstHandle, firstNetwork.remoteStorageID);

    const secondRepo = clientRepo(await temporaryDirectory(), "offline-second");
    const secondNetwork = attachAuthenticatedNetwork(
      secondRepo,
      first.websocketURL,
      "valid",
    );
    await withTimeout(secondNetwork.network.whenReady(), 10_000, "second peer");
    const secondHandle = await secondRepo.find(firstHandle.url, {
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(secondHandle.doc().sharedBase, "present before disconnection");

    detachNetwork(firstRepo, firstNetwork.network);
    detachNetwork(secondRepo, secondNetwork.network);

    firstHandle.change((doc) => {
      doc.firstOfflineEdit = "written by the first replica";
    });
    secondHandle.change((doc) => {
      doc.secondOfflineEdit = "written by the second replica";
    });
    await Promise.all([
      firstRepo.flush([firstHandle.documentId]),
      secondRepo.flush([secondHandle.documentId]),
    ]);

    await first.service.shutdown();
    services.splice(services.indexOf(first.service), 1);

    const restarted = await startFixture([account], { storageRoot });
    const reconnectedFirst = attachAuthenticatedNetwork(
      firstRepo,
      restarted.websocketURL,
      "valid",
    );
    const reconnectedSecond = attachAuthenticatedNetwork(
      secondRepo,
      restarted.websocketURL,
      "valid",
    );
    await Promise.all([
      withTimeout(
        reconnectedFirst.network.whenReady(),
        10_000,
        "reconnected first peer",
      ),
      withTimeout(
        reconnectedSecond.network.whenReady(),
        10_000,
        "reconnected second peer",
      ),
    ]);
    await eventually(
      () =>
        firstHandle.doc().secondOfflineEdit ===
          "written by the second replica" &&
        secondHandle.doc().firstOfflineEdit === "written by the first replica",
      10_000,
    );
    await Promise.all([
      waitForRemoteHeads(firstHandle, reconnectedFirst.remoteStorageID),
      waitForRemoteHeads(secondHandle, reconnectedSecond.remoteStorageID),
    ]);

    const cleanRepo = clientRepo(await temporaryDirectory(), "clean-third");
    const cleanNetwork = attachAuthenticatedNetwork(
      cleanRepo,
      restarted.websocketURL,
      "valid",
    );
    await withTimeout(cleanNetwork.network.whenReady(), 10_000, "clean peer");
    const cleanHandle = await cleanRepo.find(firstHandle.url, {
      signal: AbortSignal.timeout(10_000),
    });
    await eventually(
      () =>
        cleanHandle.doc().firstOfflineEdit === "written by the first replica" &&
        cleanHandle.doc().secondOfflineEdit === "written by the second replica",
      10_000,
    );

    const convergedHeads = JSON.stringify([...firstHandle.heads()].sort());
    assert.equal(
      JSON.stringify([...secondHandle.heads()].sort()),
      convergedHeads,
    );
    assert.equal(
      JSON.stringify([...cleanHandle.heads()].sort()),
      convergedHeads,
    );
  },
  { timeout: 45_000 },
);

test(
  "per-task vault imports logical data, opens narrowly, and converges offline reviews through hosted Repo",
  async () => {
    const rootURL = generateAutomergeUrl();
    const catalogURL = generateAutomergeUrl();
    const taskURL = generateAutomergeUrl();
    const account = boundAccount("user-a", "account-a", rootURL);
    const fixture = await startFixture([account]);

    const firstRepo = clientRepo(await temporaryDirectory(), "per-task-first");
    const firstVault = await PerTaskRepository.create(
      new RepoPerTaskDocuments(firstRepo),
      perTaskLogicalVault(),
      {
        rootURL,
        catalogURL,
        taskURLs: { "per-task-network-task": taskURL },
      },
    );
    const firstNetwork = attachAuthenticatedNetwork(
      firstRepo,
      fixture.websocketURL,
      "valid",
    );
    await withTimeout(
      firstNetwork.network.whenReady(),
      10_000,
      "first v2 peer",
    );
    for (const documentURL of [rootURL, catalogURL, taskURL]) {
      await waitForRemoteHeads(
        await firstRepo.find(documentURL),
        firstNetwork.remoteStorageID,
      );
    }

    const secondDirectory = await temporaryDirectory();
    const secondRepo = clientRepo(secondDirectory, "per-task-second");
    const secondNetwork = attachAuthenticatedNetwork(
      secondRepo,
      fixture.websocketURL,
      "valid",
    );
    await withTimeout(
      secondNetwork.network.whenReady(),
      10_000,
      "second v2 peer",
    );
    const secondVault = await PerTaskRepository.open(
      new RepoPerTaskDocuments(secondRepo),
      rootURL,
    );
    assert.equal((await secondVault.getReviewQueue(10_000)).length, 1);

    detachNetwork(firstRepo, firstNetwork.network);
    detachNetwork(secondRepo, secondNetwork.network);
    await firstVault.apply([perTaskReview("first-offline", 20_000)]);
    await secondVault.apply([perTaskReview("second-offline", 30_000)]);

    const reconnectedFirst = attachAuthenticatedNetwork(
      firstRepo,
      fixture.websocketURL,
      "valid",
    );
    const reconnectedSecond = attachAuthenticatedNetwork(
      secondRepo,
      fixture.websocketURL,
      "valid",
    );
    await Promise.all([
      withTimeout(
        reconnectedFirst.network.whenReady(),
        10_000,
        "reconnected first v2 peer",
      ),
      withTimeout(
        reconnectedSecond.network.whenReady(),
        10_000,
        "reconnected second v2 peer",
      ),
    ]);
    await eventually(async () => {
      const first = await firstVault.getProjection();
      const second = await secondVault.getProjection();
      return first.observationCount === 2 && second.observationCount === 2;
    }, 10_000);
    // Task convergence does not make catalog sync atomic: an older peer repair
    // can arrive after our local repair. Require eventual exact task-head parity
    // on both replicas, not an instantaneous assertion on only the first one.
    for (const [vault, repo] of [
      [firstVault, firstRepo],
      [secondVault, secondRepo],
    ]) {
      await eventually(async () => {
        await vault.repairCatalog();
        const task = await repo.find(taskURL);
        const catalog = await repo.find(catalogURL);
        return (
          JSON.stringify(
            JSON.parse(String(catalog.doc().entries["per-task-network-task"]))
              .indexedTaskHeads,
          ) === JSON.stringify(automergeHeads(task.doc()).sort())
        );
      }, 10_000);
    }
    assert.equal((await secondVault.getProjection()).observationCount, 2);

    const generation = await firstVault.rolloverCatalog();
    await waitForRemoteHeads(
      await firstRepo.find(generation.documentURL),
      reconnectedFirst.remoteStorageID,
    );
    await waitForRemoteHeads(
      await firstRepo.find(rootURL),
      reconnectedFirst.remoteStorageID,
    );
    // Let the cached reader receive the root announcement but deliberately do
    // not open the new catalog before killing it. The next reader must fetch
    // the new generation without a third client warming the server first.
    await eventually(
      async () =>
        JSON.stringify([...(await secondRepo.find(rootURL)).heads()].sort()) ===
        JSON.stringify([...(await firstRepo.find(rootURL)).heads()].sort()),
      10_000,
    );
    await secondRepo.flush();
    await secondRepo.shutdown();
    const reopenedRepo = clientRepo(secondDirectory, "per-task-reopened");
    const reopenedNetwork = attachAuthenticatedNetwork(
      reopenedRepo,
      fixture.websocketURL,
      "valid",
    );
    await withTimeout(
      reopenedNetwork.network.whenReady(),
      10_000,
      "reopened v2 peer",
    );
    const reopened = await withTimeout(
      PerTaskRepository.open(new RepoPerTaskDocuments(reopenedRepo), rootURL),
      10_000,
      "unwarmed catalog handoff",
    );
    // Direct Repo opening can show the available predecessor while it fetches
    // the announcement. It must still select the exact new generation without
    // another client warming its contents or a manual reload.
    await eventually(async () => {
      await reopened.getCatalogEntries();
      return reopened.catalogURL === generation.documentURL;
    }, 10_000);
    assert.equal(reopened.catalogURL, generation.documentURL);
    assert.equal((await reopened.getProjection()).observationCount, 2);
  },
  { timeout: 45_000 },
);

test("Repo refetches a document when only its persisted sync state survives restart", async () => {
  const source = clientRepo(await temporaryDirectory(), "cache-gap-source");
  const original = source.create({ content: "durable remote catalog" });
  const accounts = [boundAccount("user-a", "account-a", original.url)];
  const serverDirectory = await temporaryDirectory();
  let fixture = await startFixture(accounts, { storageRoot: serverDirectory });
  const sourceNetwork = attachAuthenticatedNetwork(
    source,
    fixture.websocketURL,
    "valid",
  );
  await sourceNetwork.network.whenReady();
  await waitForRemoteHeads(original, sourceNetwork.remoteStorageID);

  const readerDirectory = await temporaryDirectory();
  const reader = clientRepo(readerDirectory, "cache-gap-reader");
  const readerNetwork = attachAuthenticatedNetwork(
    reader,
    fixture.websocketURL,
    "valid",
  );
  await readerNetwork.network.whenReady();
  const cached = await reader.find(original.url);
  await waitForRemoteHeads(cached, readerNetwork.remoteStorageID);
  await reader.flush();
  await reader.shutdown();

  for (const coldServer of [false, true]) {
    if (coldServer) {
      await source.shutdown();
      await fixture.service.shutdown();
      fixture = await startFixture(accounts, { storageRoot: serverDirectory });
    }

    // Model the IndexedDB crash gap observed on immediate browser reload:
    // sync state reached storage, but document chunks did not. Delete only this
    // test client's chunks, never the server's durable document or sync cache.
    const storage = new AtomicNodeFSStorageAdapter(readerDirectory);
    const syncState = await storage.loadRange([
      original.documentId,
      "sync-state",
    ]);
    assert.ok(
      syncState.some(
        ({ data }) => data && decodeSyncState(data).sharedHeads.length > 0,
      ),
      "retain the acknowledged heads that suppress a fresh request frame",
    );
    await storage.removeRange([original.documentId, "snapshot"]);
    await storage.removeRange([original.documentId, "incremental"]);
    assert.deepEqual(await storage.loadRange([original.documentId]), syncState);
    await storage.close();

    const reopened = clientRepo(
      readerDirectory,
      `cache-gap-reopened-${coldServer}`,
    );
    const reopenedNetwork = attachAuthenticatedNetwork(
      reopened,
      fixture.websocketURL,
      "valid",
    );
    await reopenedNetwork.network.whenReady();
    const recovered = await withTimeout(
      reopened.find(original.url),
      3_000,
      "refetch with stale sync state",
    );
    assert.deepEqual(recovered.doc(), original.doc());
    await waitForRemoteHeads(recovered, reopenedNetwork.remoteStorageID);
    await reopened.flush();
    await reopened.shutdown();
  }
});

async function startFixture(accounts, overrides = {}) {
  const storageRoot = overrides.storageRoot ?? (await temporaryDirectory());
  const verifier = new TestFirebaseIDTokenVerifier(
    overrides.principals ?? {
      valid: principalFor(accounts[0]?.authSubject ?? "user-a"),
    },
  );
  const logger = new MemorySafeLogger();
  const configuration = {
    host: "127.0.0.1",
    port: 0,
    exposeMetrics: true,
    allowedOrigins: new Set([allowedOrigin]),
    storageRoot,
    maximumSocketLifetimeMillis: 5_000,
    maximumSockets: 20,
    maximumSocketsPerAccount: 4,
    maximumLoadedAccounts: 4,
    maximumMessageBytes: 64 * 1_024,
    maximumAdmissionFrameBytes: 8_192,
    admissionTimeoutMillis: 500,
    maximumMessagesPerMinute: 1_000,
    maximumControlRequestsPerMinute: 1_000,
    maximumStorageBytesPerAccount: 20 * 1_024 * 1_024,
    storageConcurrency: 8,
    idleRepoTimeoutMillis: 5_000,
    recycleAfterRepoCreations: 1_000,
    recycleRSSBytes: 4 * 1_024 * 1_024 * 1_024,
    ...withoutPrincipals(overrides),
  };
  const accountStore =
    overrides.accountStore ?? new InMemoryHostedVaultAccountStore(accounts);
  const service = new HostedSyncService(configuration, {
    accounts: accountStore,
    verifier,
    logger,
  });
  services.push(service);
  const address = await service.start();
  return {
    service,
    accounts: accountStore,
    verifier,
    logger,
    httpOrigin: `http://127.0.0.1:${address.port}`,
    websocketURL: `ws://127.0.0.1:${address.port}/v1/sync`,
  };
}

function withoutPrincipals({
  principals: _principals,
  accountStore: _accountStore,
  ...configuration
}) {
  return configuration;
}

function control(
  origin,
  pathName,
  body,
  { authorization = "ID valid", origin: requestOrigin = allowedOrigin } = {},
) {
  return fetch(`${origin}${pathName}`, {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
      Origin: requestOrigin,
    },
    body: JSON.stringify(body),
  });
}

function admission(firebaseIDToken) {
  return JSON.stringify({
    type: "orbit-sync-admission",
    protocolVersion: 1,
    firebaseIDToken,
  });
}

function openSocket(url, { headers, origin = allowedOrigin } = {}) {
  return new Promise((resolve, reject) => {
    const options = { headers };
    if (origin !== null) options.origin = origin;
    const socket = new WebSocket(url, options);
    socket.once("open", () => resolve(socket));
    socket.once("unexpected-response", (_request, response) => {
      reject(new Error(`Upgrade rejected: ${response.statusCode}`));
    });
    socket.once("error", reject);
  });
}

function nativeAdmissionHeaders(firebaseIDToken) {
  return {
    Authorization: `ID ${firebaseIDToken}`,
  };
}

function installNativeHeaderWebSocket(firebaseIDToken) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  const headers = nativeAdmissionHeaders(firebaseIDToken);
  class NativeHeaderWebSocket extends WebSocket {
    constructor(url) {
      super(url, { headers });
    }
  }
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    writable: true,
    value: NativeHeaderWebSocket,
  });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, "WebSocket", previous);
    } else {
      delete globalThis.WebSocket;
    }
  };
}

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    socket.once("message", resolve);
    socket.once("error", reject);
  });
}

function nextClose(socket) {
  return new Promise((resolve) => {
    socket.once("close", (code, reason) => resolve({ code, reason }));
  });
}

function hostedAccount(overrides = {}) {
  return {
    schemaVersion: 1,
    authIssuer: "https://securetoken.google.com/orbit-test",
    authSubject: "user-a",
    emailAddress: "user-a@example.test",
    registrationTimestampMillis: Date.now() - 86_400_000,
    hostedVaultID: "account-a",
    root: { status: "unbound" },
    migration: {
      mode: "automerge",
      source: "new-account",
      cutoverAtTimestampMillis: Date.now() - 1_000,
      rollbackUntilTimestampMillis: null,
      legacyArchiveKey: null,
    },
    notificationMode: "pending",
    ...overrides,
  };
}

function boundAccount(subject, accountID, root = generateAutomergeUrl()) {
  return hostedAccount({
    authSubject: subject,
    emailAddress: `${subject}@example.test`,
    hostedVaultID: accountID,
    root: {
      status: "bound",
      documentURL: root,
      boundAtTimestampMillis: Date.now(),
    },
  });
}

function principalFor(subject) {
  return {
    subject,
    issuer: "https://securetoken.google.com/orbit-test",
    expiresAtTimestampMillis: Date.now() + 60_000,
  };
}

function perTaskLogicalVault() {
  return {
    vaultID: "per-task-network-vault",
    createdAtTimestampMillis: 1_000,
    scheduler: defaultOrbitSchedulerPolicy,
    tasks: {
      "per-task-network-task": {
        createdAtTimestampMillis: 1_000,
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.Plain,
            body: { text: "Network convergence prompt", attachments: [] },
          },
        },
        provenance: null,
        metadata: {},
        isDeleted: false,
      },
    },
    observations: {},
    attachments: {},
  };
}

function perTaskReview(id, occurredAtTimestampMillis) {
  return {
    kind: "recordReview",
    mutationID: `mutation-${id}`,
    taskID: "per-task-network-task",
    observationID: id,
    componentID: "main",
    reviewSessionID: null,
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis,
  };
}

class TestFirebaseIDTokenVerifier {
  revokedSubjects = new Set();

  constructor(principals) {
    this.principals = principals;
  }

  async verifyIDToken(token) {
    const principal = this.principals[token];
    if (!principal || this.revokedSubjects.has(principal.subject)) {
      throw new Error("Invalid test identity");
    }
    return structuredClone(principal);
  }
}

function clientRepo(storageRoot, suffix) {
  const repo = new Repo({
    peerId: `orbit-test-${suffix}`,
    isEphemeral: false,
    storage: new AtomicNodeFSStorageAdapter(storageRoot),
    network: [],
    enableRemoteHeadsGossiping: true,
    saveDebounceRate: 0,
    shareConfig: {
      announce: async () => true,
      access: async () => true,
    },
  });
  repos.push(repo);
  return repo;
}

function attachAuthenticatedNetwork(repo, websocketURL, firebaseIDToken) {
  const network = new AuthenticatedWebSocketNetworkAdapter(
    websocketURL,
    async () => ({ kind: "firebaseIDToken", token: firebaseIDToken }),
    {
      retryIntervalMillis: 25,
      webSocketFactory: {
        create: (url) => new WebSocket(url, { origin: allowedOrigin }),
      },
    },
  );
  repo.networkSubsystem.addNetworkAdapter(network);
  return {
    network,
    get remoteStorageID() {
      assert.ok(network.remoteStorageID);
      return network.remoteStorageID;
    },
  };
}

function detachNetwork(repo, network) {
  repo.networkSubsystem.removeNetworkAdapter(network);
  network.disconnect();
}

async function waitForRemoteHeads(handle, storageID) {
  await eventually(() => {
    const local = [...handle.heads()].sort();
    const remote = [...(handle.getSyncInfo(storageID)?.lastHeads ?? [])].sort();
    return JSON.stringify(local) === JSON.stringify(remote);
  }, 10_000);
}

async function eventually(predicate, timeoutMillis = 2_000) {
  const deadline = Date.now() + timeoutMillis;
  for (;;) {
    if (await predicate()) return;
    if (Date.now() >= deadline) throw new Error("Timed out awaiting condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function withTimeout(promise, timeoutMillis, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out awaiting ${label}`)),
        timeoutMillis,
      ),
    ),
  ]);
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-sync-service-test-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}
