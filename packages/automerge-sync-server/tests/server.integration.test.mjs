import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { Repo, cbor, generateAutomergeUrl } from "@automerge/automerge-repo";
import WebSocket from "ws";
import {
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  defaultOrbitSchedulerPolicy,
} from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { AuthenticatedWebSocketNetworkAdapter } from "@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter";
import {
  AtomicNodeFSStorageAdapter,
  LabSyncService,
  ensureStorageID,
  loadLabConfiguration,
} from "../dist/index.js";

const token = "private-test-pairing-credential-0123456789";
const origin = "http://localhost:8081";
const directories = [];
const services = [];
const clients = [];

afterEach(async () => {
  await Promise.allSettled(
    clients.splice(0).map((client) => client.repo.shutdown()),
  );
  await Promise.allSettled(
    services.splice(0).map((service) => service.shutdown()),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("private bootstrap rejects invalid pairing/origins and does not expose retired public routes", async () => {
  const fixture = await startFixture();
  for (const candidate of [undefined, "wrong-pairing-token"]) {
    const response = await fetch(`${fixture.http}/v1/root`, {
      method: "POST",
      headers: candidate ? { Authorization: `Bearer ${candidate}` } : {},
    });
    assert.equal(response.status, 401);
  }
  assert.equal(
    (
      await fetch(`${fixture.http}/v1/root`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: "https://withorbit.com",
        },
      })
    ).status,
    403,
  );
  const response = await fetch(`${fixture.http}/v1/root`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Origin: origin },
  });
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.deepEqual(await response.json(), {
    rootDocumentURL: fixture.configuration.rootDocumentURL,
  });
  for (const route of [
    "/v1/hosted-roots:resolve",
    "/v1/notification-settings",
    "/v1/embedded/reviews",
    "/_metrics",
  ])
    assert.equal(
      (await fetch(fixture.http + route, { method: "POST" })).status,
      404,
    );
  assert.equal(
    (await fetch(`${fixture.http}/v1/root?token=${token}`, { method: "POST" }))
      .status,
    404,
  );
});

test("browser admission rejects unauthenticated Repo bytes and sends acknowledgement before Repo frames", async () => {
  const fixture = await startFixture();
  const wrong = new WebSocket(fixture.ws, { origin });
  await opened(wrong);
  wrong.send(
    JSON.stringify({
      type: "orbit-sync-admission",
      protocolVersion: 1,
      token: "wrong",
    }),
  );
  assert.equal(await closed(wrong), 1008);
  const early = new WebSocket(fixture.ws, { origin });
  await opened(early);
  early.send(
    cbor.encode({
      type: "join",
      senderId: "not-admitted",
      supportedProtocolVersions: ["1"],
    }),
  );
  assert.equal(await closed(early), 1008);
  const client = await openClient(fixture);
  assert.ok(client.network.remoteStorageID);
  assert.equal((await client.vault.readLogicalVault()).vaultID, "lab-test");
});

test("an originless headless socket still rejects Repo bytes before paired admission", async () => {
  const fixture = await startFixture();
  const socket = new WebSocket(fixture.ws);
  await opened(socket);
  socket.send(
    cbor.encode({
      type: "join",
      senderId: "not-admitted",
      supportedProtocolVersions: ["1"],
    }),
  );
  assert.equal(await closed(socket), 1008);
});

test("native header admission immediately accepts an ordinary Repo join without application frames", async () => {
  const fixture = await startFixture();
  const socket = new WebSocket(fixture.ws, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const first = new Promise((resolve, reject) => {
    socket.once("message", (bytes) => resolve(cbor.decode(bytes)));
    socket.once("error", reject);
  });
  await opened(socket);
  socket.send(
    cbor.encode({
      type: "join",
      senderId: "native-fixture",
      peerMetadata: { isEphemeral: true },
      supportedProtocolVersions: ["1"],
    }),
  );
  const peer = await first;
  assert.equal(peer.type, "peer");
  assert.equal(peer.peerMetadata.isEphemeral, false);
  assert.ok(peer.peerMetadata.storageId);
  socket.close();
  await closed(socket);
});

test("startup refuses missing root files and concurrent writers rather than creating an empty vault", async () => {
  const fixture = await startFixture();
  const conflicting = new LabSyncService(fixture.configuration);
  await assert.rejects(conflicting.start(), /another writer/);
  const missing = new LabSyncService({
    ...fixture.configuration,
    storageRoot: await directory(),
    rootDocumentURL: generateAutomergeUrl(),
  });
  await assert.rejects(missing.start(), /root is absent/);
  const configPath = path.join(await directory(), "config.json");
  await assert.rejects(loadLabConfiguration(configPath), /ENOENT/);
  await fs.writeFile(
    configPath,
    JSON.stringify({ storageRoot: fixture.configuration.storageRoot }),
  );
  await assert.rejects(loadLabConfiguration(configPath), /rootDocumentURL/);
});

test(
  "two real Repo clients converge offline reviews, survive cold reopen and server restart exactly once",
  { timeout: 30000 },
  async () => {
    const fixture = await startFixture();
    const first = await openClient(fixture);
    const second = await openClient(fixture);
    const storageID = first.network.remoteStorageID;
    await first.vault.apply([review("online-review", "task-first", 2000)]);
    await eventually(async () =>
      assert.ok(
        (await second.vault.readLogicalVault()).observations["online-review"],
      ),
    );
    first.network.disconnect();
    second.network.disconnect();
    await first.vault.apply([review("offline-first", "task-second", 3000)]);
    await first.vault.apply([review("offline-first", "task-second", 3000)]);
    await second.vault.apply([review("offline-second", "task-second", 4000)]);
    await first.vault.close();
    await first.repo.shutdown();
    clients.splice(clients.indexOf(first), 1);
    const reopened = await openClient(fixture, {
      storageRoot: first.storageRoot,
      offline: true,
    });
    assert.ok(
      (await reopened.vault.readLogicalVault()).observations["offline-first"],
    );
    await fixture.service.shutdown();
    services.splice(services.indexOf(fixture.service), 1);
    const replacement = await startFixture(fixture.configuration);
    reopened.network = attachNetwork(reopened.repo, replacement.ws);
    second.network = attachNetwork(second.repo, replacement.ws);
    await Promise.all([
      reopened.network.whenReady(),
      second.network.whenReady(),
    ]);
    assert.equal(reopened.network.remoteStorageID, storageID);
    for (const client of [reopened, second]) {
      await eventually(async () =>
        assert.deepEqual(
          Object.keys(
            (await client.vault.readLogicalVault()).observations,
          ).sort(),
          ["offline-first", "offline-second", "online-review"],
        ),
      );
    }
    await replacement.service.shutdown();
    services.splice(services.indexOf(replacement.service), 1);
    const probe = new Repo({
      storage: new AtomicNodeFSStorageAdapter(
        fixture.configuration.storageRoot,
      ),
      network: [],
    });
    try {
      const vault = await PerTaskRepository.open(
        new RepoPerTaskDocuments(probe),
        fixture.configuration.rootDocumentURL,
      );
      assert.deepEqual(
        Object.keys((await vault.readLogicalVault()).observations).sort(),
        ["offline-first", "offline-second", "online-review"],
      );
      await vault.close();
    } finally {
      await probe.shutdown();
    }
  },
);

async function startFixture(configuration) {
  if (!configuration) {
    const storageRoot = await directory();
    const storage = new AtomicNodeFSStorageAdapter(storageRoot);
    await ensureStorageID(storage);
    const seed = new Repo({ storage, network: [] });
    const vault = await PerTaskRepository.create(
      new RepoPerTaskDocuments(seed),
      {
        vaultID: "lab-test",
        createdAtTimestampMillis: 1000,
        scheduler: defaultOrbitSchedulerPolicy,
        observations: {},
        attachments: {},
        tasks: Object.fromEntries(
          ["task-first", "task-second"].map((id) => [
            id,
            {
              createdAtTimestampMillis: 1000,
              isDeleted: false,
              provenance: null,
              metadata: {},
              spec: {
                type: TaskSpecType.Memory,
                content: {
                  type: TaskContentType.Plain,
                  body: { text: id, attachments: [] },
                },
              },
            },
          ]),
        ),
      },
    );
    configuration = {
      storageRoot,
      rootDocumentURL: vault.rootURL,
      pairingToken: token,
      updatesRoot: path.join(storageRoot, "updates"),
      allowedOrigins: new Set([origin]),
      port: 0,
    };
    await vault.close();
    await seed.shutdown();
  }
  const service = new LabSyncService(configuration);
  services.push(service);
  const address = await service.start();
  return {
    configuration,
    service,
    http: `http://127.0.0.1:${address.port}`,
    ws: `ws://127.0.0.1:${address.port}/v1/sync`,
  };
}

async function openClient(fixture, { storageRoot, offline = false } = {}) {
  storageRoot ??= await directory();
  const repo = new Repo({
    storage: new AtomicNodeFSStorageAdapter(storageRoot),
    network: [],
  });
  const network = offline ? null : attachNetwork(repo, fixture.ws);
  if (network) await network.whenReady();
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.configuration.rootDocumentURL,
  );
  await vault.readLogicalVault(); // Prime the real task documents before disconnecting.
  const client = { repo, vault, network, storageRoot };
  clients.push(client);
  return client;
}

function attachNetwork(repo, wsURL) {
  const adapter = new AuthenticatedWebSocketNetworkAdapter(
    wsURL,
    async () => ({ kind: "pairedToken", token }),
    {
      retryIntervalMillis: 100,
      webSocketFactory: { create: (url) => new WebSocket(url, { origin }) },
    },
  );
  repo.networkSubsystem.addNetworkAdapter(adapter);
  return adapter;
}

function review(id, taskID, timestamp) {
  return {
    kind: "recordReview",
    mutationID: id,
    observationID: id,
    taskID,
    componentID: "main",
    reviewSessionID: null,
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: timestamp,
  };
}

async function directory() {
  const result = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-lab-test-"));
  directories.push(result);
  return result;
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}
function closed(socket) {
  return new Promise((resolve) => socket.once("close", resolve));
}
async function eventually(assertion) {
  const until = Date.now() + 10000;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}
