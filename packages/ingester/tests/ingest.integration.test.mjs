import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, test as nodeTest } from "node:test";
import { Repo, cbor, generateAutomergeUrl } from "@automerge/automerge-repo";
import { WebSocketServer } from "ws";
import {
  AtomicNodeFSStorageAdapter,
  acquireWriterLock,
  LabSyncService,
} from "@withorbit/automerge-sync-server";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { AuthenticatedWebSocketNetworkAdapter } from "@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import {
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import { runIngest } from "../dist/bin/run.js";

const directories = [];
const services = [];
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("a paired importer publishes new documents, preserves reviews, and cold repeat is a no-op", async () => {
  const fixture = await startFixture();
  const input = {
    sources: [
      {
        identifier: "note",
        title: "Renamed note",
        items: [
          { identifier: "old-content", spec: spec("Old") },
          { identifier: "new-content", spec: spec("New") },
        ],
      },
    ],
  };
  const preview = await runIngest({
    ingestible: input,
    configurationPath: fixture.configurationPath,
    dryRun: true,
  });
  assert.deepEqual(preview, {
    dryRun: true,
    mutationCount: 2,
    counts: { ingestTask: 1, updateTaskProvenance: 1 },
  });
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const observerRepo = new Repo({ network: [network] });
  await network.whenReady();
  const observer = await PerTaskRepository.open(
    new RepoPerTaskDocuments(observerRepo),
    fixture.rootURL,
  );
  let result;
  try {
    const before = await observer.readLogicalVault();
    assert.equal(Object.keys(before.tasks).length, 1);
    assert.equal(before.tasks["original-task"].provenance.title, "Old note");
    [result] = await Promise.all([
      runIngest({
        ingestible: input,
        configurationPath: fixture.configurationPath,
      }),
      observer.apply([
        {
          kind: "recordReview",
          mutationID: "concurrent-review",
          observationID: "concurrent-review",
          taskID: "original-task",
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 2000,
        },
      ]),
    ]);
    const deadline = Date.now() + 10000;
    for (;;) {
      const current = await observer.readLogicalVault();
      if (
        Object.keys(current.tasks).length === 2 &&
        current.tasks["original-task"].provenance.title === "Renamed note"
      )
        break;
      if (Date.now() > deadline)
        assert.fail("Independent peer did not receive the ingested tasks");
      await delay(20);
    }
  } finally {
    await observer.close();
    await observerRepo.shutdown();
  }
  assert.equal(result.mutationCount, 2);
  // Change the server between cold importer runs, not just its warm local cache.
  const changeStorage = new AtomicNodeFSStorageAdapter(
    path.join(path.dirname(fixture.configurationPath), "other-client"),
  );
  const otherNetwork = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const otherRepo = new Repo({
    storage: changeStorage,
    network: [otherNetwork],
  });
  await otherNetwork.whenReady();
  const other = await PerTaskRepository.open(
    new RepoPerTaskDocuments(otherRepo),
    fixture.rootURL,
  );
  try {
    await other.apply([
      {
        kind: "updateTaskProvenance",
        mutationID: "remote-title",
        taskID: "original-task",
        provenance: { identifier: "note", title: "Remote title" },
      },
    ]);
    const taskURL = (await other.getCatalogEntries())["original-task"]
      .documentURL;
    const handle = await otherRepo.find(taskURL);
    const deadline = Date.now() + 5000;
    while (
      JSON.stringify(handle.heads().slice().sort()) !==
      JSON.stringify(
        handle
          .getSyncInfo(otherNetwork.remoteStorageID)
          ?.lastHeads.slice()
          .sort(),
      )
    ) {
      if (Date.now() > deadline)
        assert.fail("Remote title did not reach the server");
      await delay(20);
    }
  } finally {
    await other.close();
    await otherRepo.shutdown();
    await changeStorage.close();
  }
  const refreshed = await runIngest({
    ingestible: input,
    configurationPath: fixture.configurationPath,
  });
  assert.deepEqual(refreshed.counts, { updateTaskProvenance: 1 });
  // Each invocation is a new Repo process owner. There is no in-memory importer journal.
  assert.equal(
    (
      await runIngest({
        ingestible: input,
        configurationPath: fixture.configurationPath,
      })
    ).mutationCount,
    0,
  );
  // The external notes wrapper has Bun, but no interactive fnm/Node PATH.
  const inputPath = path.join(path.dirname(fixture.configurationPath), "input.json");
  await fs.writeFile(inputPath, JSON.stringify(input));
  const bunChild = spawn("bun", [fileURLToPath(new URL("../src/bin/run.ts", import.meta.url)), inputPath, "--config", fixture.configurationPath]);
  let bunOutput = "";
  let bunError = "";
  bunChild.stdout.setEncoding("utf8").on("data", (text) => { bunOutput += text; });
  bunChild.stderr.setEncoding("utf8").on("data", (text) => { bunError += text; });
  assert.equal(await new Promise((resolve) => bunChild.once("close", resolve)), 0, bunError);
  assert.equal(JSON.parse(bunOutput).mutationCount, 0);
  await fixture.service.shutdown();
  services.splice(services.indexOf(fixture.service), 1);
  // Inspect disk only after the server is quiesced. Its own Repo owns every write.
  const storage = new AtomicNodeFSStorageAdapter(fixture.storageRoot);
  const repo = new Repo({ storage, network: [] });
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.rootURL,
  );
  try {
    const logical = await vault.readLogicalVault();
    assert.equal(Object.keys(logical.tasks).length, 2);
    assert.equal(
      logical.tasks["original-task"].provenance?.title,
      "Renamed note",
    );
    assert.deepEqual(Object.keys(logical.observations).sort(), [
      "concurrent-review",
      "original-review",
    ]);
    assert.equal(
      logical.observations["original-review"].taskID,
      "original-task",
    );
  } finally {
    await vault.close();
    await repo.shutdown();
    await storage.close();
  }
});

test("CLI input and authentication failures exit nonzero without leaking the pairing token", async () => {
  const fixture = await startFixture();
  const directory = path.dirname(fixture.configurationPath);
  const input = path.join(directory, "input.json");
  const command = fileURLToPath(new URL("../dist/bin/run.js", import.meta.url));
  await fs.writeFile(input, '{"notSources":[]}');
  const invalid = spawnSync(process.execPath, [command, input], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid ingestible JSON/);
  await fs.writeFile(input, '{"sources":[]}');
  const configuration = JSON.parse(
    await fs.readFile(fixture.configurationPath, "utf8"),
  );
  configuration.pairingToken = "wrong-private-fixture-token-0123456789";
  await fs.writeFile(fixture.configurationPath, JSON.stringify(configuration));
  const child = spawn(process.execPath, [
    command,
    input,
    "--config",
    fixture.configurationPath,
  ]);
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr += text;
  });
  const exit = await new Promise((resolve) => child.once("close", resolve));
  assert.equal(exit, 1);
  assert.match(stderr, /bootstrap failed \(401\)/);
  assert.ok(!stderr.includes(configuration.pairingToken));
});

nodeTest(
  "a paired but silent server cannot leave document lookup hanging",
  { timeout: 45000 },
  async () => {
    const directory = await temporaryDirectory();
    const rootDocumentURL = generateAutomergeUrl();
    const token = "silent-fixture-paired-token-0123456789";
    const http = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ rootDocumentURL }));
    });
    const sockets = new WebSocketServer({ noServer: true });
    http.on("upgrade", (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (peer) => {
        peer.on("message", (data, binary) => {
          if (!binary) {
            peer.send(
              JSON.stringify({
                type: "orbit-sync-admission-accepted",
                protocolVersion: 1,
              }),
            );
          } else if (cbor.decode(data).type === "join") {
            peer.send(
              cbor.encode({
                type: "peer",
                senderId: "silent-fixture",
                selectedProtocolVersion: "1",
                peerMetadata: {
                  storageId: "silent-fixture-storage",
                  isEphemeral: false,
                },
              }),
            );
          }
          // Valid admission, but intentionally never answer document requests.
        });
      });
    });
    await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
    services.push({
      shutdown: async () => {
        for (const socket of sockets.clients) socket.terminate();
        sockets.close();
        await new Promise((resolve) => http.close(resolve));
      },
    });
    const configurationPath = path.join(directory, "config.json");
    await fs.writeFile(
      configurationPath,
      JSON.stringify({
        rootDocumentURL,
        pairingToken: token,
        storageRoot: path.join(directory, "unused-server"),
        port: http.address().port,
      }),
    );
    const input = path.join(directory, "input.json");
    await fs.writeFile(input, '{"sources":[]}');
    const child = spawn(process.execPath, [
      fileURLToPath(new URL("../dist/bin/run.js", import.meta.url)),
      input,
      "--config",
      configurationPath,
    ]);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (text) => {
      stderr += text;
    });
    assert.equal(
      await new Promise((resolve) => child.once("close", resolve)),
      1,
    );
    assert.match(stderr, /timeout|timed out/i);
    const release = await acquireWriterLock(
      path.join(directory, "ingester-repo"),
    );
    await release();
    assert.equal(sockets.clients.size, 0);
  },
);

test("a multi-batch inventory can be released and reopened on a cold repeat", async () => {
  const fixture = await startFixture(130);
  for (let i = 0; i < 2; i++) {
    const result = await runIngest({
      ingestible: { sources: [] },
      configurationPath: fixture.configurationPath,
    });
    assert.equal(result.mutationCount, 0);
  }
});

async function startFixture(extraTaskCount = 0) {
  const directory = await temporaryDirectory();
  const storageRoot = path.join(directory, "server");
  const seedStorage = new AtomicNodeFSStorageAdapter(storageRoot);
  const seedRepo = new Repo({ storage: seedStorage, network: [] });
  const vault = await PerTaskRepository.createEmpty(
    new RepoPerTaskDocuments(seedRepo),
    { vaultID: "ingest-fixture" },
  );
  await vault.apply([
    {
      kind: "ingestTask",
      mutationID: "seed",
      task: {
        taskID: "original-task",
        createdAtTimestampMillis: 0,
        spec: spec("Old"),
        provenance: { identifier: "note", title: "Old note" },
        metadata: { ingestSourceIdentifier: "old-content" },
      },
    },
    {
      kind: "recordReview",
      mutationID: "original-review",
      observationID: "original-review",
      taskID: "original-task",
      componentID: "main",
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 1000,
    },
  ]);
  await vault.apply(
    Array.from({ length: extraTaskCount }, (_, i) => ({
      kind: "ingestTask",
      mutationID: `inventory-${i}`,
      task: {
        taskID: `inventory-${i}`,
        createdAtTimestampMillis: 0,
        spec: spec(`Inventory ${i}`),
        provenance: null,
      },
    })),
  );
  const rootURL = vault.rootURL;
  await vault.close();
  await seedRepo.shutdown();
  await seedStorage.close();
  const configuration = {
    storageRoot,
    rootDocumentURL: rootURL,
    pairingToken: "paired-ingester-fixture-token-0123456789",
    updatesRoot: path.join(directory, "updates"),
    port: 0,
    allowedOrigins: new Set(),
  };
  const service = new LabSyncService(configuration);
  const address = await service.start();
  service.configuration.port = address.port;
  services.push(service);
  const configurationPath = path.join(directory, "config.json");
  await fs.writeFile(
    configurationPath,
    JSON.stringify({
      ...configuration,
      port: address.port,
      allowedOrigins: [],
    }),
  );
  return { service, configurationPath, storageRoot, rootURL };
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-ingester-test-"),
  );
  directories.push(directory);
  return directory;
}

function spec(question) {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: question, attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  };
}
