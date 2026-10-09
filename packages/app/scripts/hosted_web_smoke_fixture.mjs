// Independent Node Repo client: never inspect the browser's in-memory vault.
// Only localhost emulators and an owned temporary sync volume are permitted.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Repo } from "@automerge/automerge-repo";
import WebSocket from "ws";
import {
  HostedSyncService,
  FirebaseAdminIDTokenVerifier,
  configurationFromEnvironment,
} from "@withorbit/automerge-sync-server";
import { FirestoreHostedVaultAccountStore } from "../../automerge-sync-server/dist/accounts/firestoreAccountStore.js";
import {
  BinaryPerTaskDocuments,
  RepoAutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { TaskContentType, TaskSpecType } from "@withorbit/core";
import { AuthenticatedWebSocketNetworkAdapter } from "../src/sync/AuthenticatedWebSocketNetworkAdapter.ts";

const origin =
  process.env.ORBIT_HOSTED_WEB_SMOKE_SYNC_ORIGIN ?? "http://127.0.0.1:8787";
const serviceURL = new URL(origin);
assert.ok(
  serviceURL.protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(serviceURL.hostname),
  "Hosted smoke sync service must be local",
);
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const app = initializeApp({ projectId: "metabook-system" });
const scratch = await mkdtemp(
  path.join(os.tmpdir(), "orbit-hosted-web-smoke-"),
);
let service;
let repo;

async function eventually(predicate, label) {
  const deadline = Date.now() + 30_000;
  while (!(await predicate())) {
    assert.ok(Date.now() < deadline, `Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function control(idToken, route, body = {}) {
  const response = await fetch(`${origin}/v1/hosted-roots:${route}`, {
    method: "POST",
    headers: {
      Authorization: `ID ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(
    response.status,
    200,
    `Hosted control ${route}: ${await response.clone().text()}`,
  );
  return response.json();
}

async function waitForProvisionedAccount(idToken) {
  // Auth sign-up resolves before its asynchronous onUserCreate trigger. Read
  // the actual trigger's account record; never fabricate provisioning here.
  const subject = JSON.parse(
    Buffer.from(idToken.split(".")[1], "base64url"),
  ).sub;
  let snapshot;
  await eventually(async () => {
    snapshot = await getFirestore(app)
      .doc(`hostedVaultAccounts/${subject}`)
      .get();
    return snapshot.exists;
  }, "account provisioning");
  const account = snapshot.data();
  assert.equal(account.authSubject, subject);
  assert.equal(account.migration.mode, "automerge");
  return account;
}

function spec(text) {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text, attachments: [] },
      answer: { text: "Lifecycle answer", attachments: [] },
    },
  };
}

async function client(idToken) {
  repo = new Repo({
    network: [],
    saveDebounceRate: 0,
    enableRemoteHeadsGossiping: true,
  });
  const storage = new RepoAutomergeBinaryStorage(repo);
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `${origin.replace("http:", "ws:")}/v1/sync`,
    async () => ({ kind: "firebaseIDToken", token: idToken }),
    {
      webSocketFactory: {
        create: (url) =>
          new WebSocket(url, { origin: "http://localhost:19006" }),
      },
    },
  );
  repo.networkSubsystem.addNetworkAdapter(network);
  await Promise.race([
    network.whenReady(),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Peer admission timeout")),
        10_000,
      ).unref(),
    ),
  ]);
  return { storage, network };
}

// Verify remote acknowledgement of every document used by this small fixture,
// not merely that a local apply promise resolved before shutting down the client.
async function flush(vault, storage, network) {
  const logical = await vault.readLogicalVault();
  const root = (await storage.handle(vault.rootURL)).doc();
  const catalog = (await storage.handle(vault.catalogURL)).doc();
  const urls = new Set([
    vault.rootURL,
    vault.catalogURL,
    ...Object.values(catalog.entries).map(
      (entry) => JSON.parse(String(entry)).documentURL,
    ),
    ...Object.values(logical.attachments).map((entry) => entry.documentURL),
  ]);
  assert.ok(root);
  for (const url of urls) {
    const handle = await storage.handle(url);
    await eventually(() => {
      const remote = handle.getSyncInfo(network.remoteStorageID)?.lastHeads;
      return (
        remote &&
        JSON.stringify([...remote].sort()) ===
          JSON.stringify([...handle.heads()].sort())
      );
    }, `server heads for ${url}`);
  }
}

async function run(command, input) {
  if (command === "serve") {
    // Intentionally do not construct a notifier or load mail credentials.
    service = new HostedSyncService(
      configurationFromEnvironment({
        PORT: serviceURL.port,
        HOST: serviceURL.hostname,
        ORBIT_SYNC_STORAGE_ROOT: scratch,
      }),
      {
        accounts: new FirestoreHostedVaultAccountStore(getFirestore(app)),
        verifier: new FirebaseAdminIDTokenVerifier(),
      },
    );
    await service.start();
    console.log(
      `Isolated hosted web smoke listening on ${origin} (mail disabled)`,
    );
    await new Promise((resolve) => {
      process.once("SIGINT", resolve);
      process.once("SIGTERM", resolve);
    });
    return;
  }
  const account = await waitForProvisionedAccount(input.idToken);
  if (command === "provisioned") return { accountID: account.hostedVaultID };
  if (command === "seed") {
    // Seed the trigger-provisioned account through the ordinary hosted client.
    const resolved = await control(input.idToken, "resolve");
    const { storage, network } = await client(input.idToken);
    const vault = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      resolved.rootDocumentURL,
    );
    const now = Date.now();
    await vault.apply([
      {
        kind: "ingestTask",
        mutationID: randomUUID(),
        task: {
          taskID: input.existingTaskID,
          createdAtTimestampMillis: now - 1_000,
          spec: spec("Existing account task"),
          provenance: null,
          metadata: { fixture: "must-survive-import" },
        },
      },
      {
        kind: "reschedule",
        mutationID: randomUUID(),
        observationID: randomUUID(),
        taskID: input.existingTaskID,
        componentID: "main",
        occurredAtTimestampMillis: now,
        newDueTimestampMillis: now + 7 * 86_400_000,
      },
    ]);
    await flush(vault, storage, network);
    return { rootURL: vault.rootURL };
  }
  const { storage, network } = await client(input.idToken);
  const resolved = await control(input.idToken, "resolve");
  const vault = await PerTaskRepository.open(
    new BinaryPerTaskDocuments(storage),
    resolved.rootDocumentURL,
  );
  if (command === "queue")
    return {
      catalogURL: vault.catalogURL,
      prompts: (await vault.getReviewQueue()).map(
        ({ task }) => task.spec.content.body.text,
      ),
    };
  if (command === "verify") {
    await eventually(async () => {
      const logical = await vault.readLogicalVault();
      return (
        Boolean(logical.tasks[input.taskID]) &&
        Object.values(logical.observations).some(
          (observation) => observation.taskID === input.taskID,
        )
      );
    }, "imported task and anonymous review");
    const logical = await vault.readLogicalVault();
    assert.deepEqual(logical.tasks[input.taskID].spec, input.spec);
    assert.equal(
      Object.values(logical.observations).filter(
        (observation) => observation.taskID === input.taskID,
      ).length,
      1,
    );
    assert.equal(logical.tasks[input.taskID].isDeleted, false);
    for (const attachmentID of input.attachmentIDs) {
      const attachment = await vault.readAttachment(attachmentID);
      assert.ok(attachment);
      assert.equal(attachment.mediaType, "image/png");
      assert.equal(
        Buffer.from(attachment.bytes).toString("base64"),
        input.pngBase64,
      );
    }
    if (input.existingRootURL) {
      assert.equal(vault.rootURL, input.existingRootURL);
      assert.equal(
        logical.tasks[input.existingTaskID]?.metadata.fixture,
        "must-survive-import",
      );
      assert.equal(logical.tasks[input.existingTaskID]?.isDeleted, false);
      assert.equal(
        Object.values(logical.observations).filter(
          (observation) => observation.taskID === input.existingTaskID,
        ).length,
        1,
      );
    }
    return {
      rootURL: vault.rootURL,
      tasks: Object.keys(logical.tasks).length,
      observations: Object.keys(logical.observations).length,
    };
  }
  let taskID = input.lifecycleTaskID;
  if (command === "create" || command === "replace") {
    taskID = randomBytes(16).toString("base64url");
    const mutations = [];
    if (command === "replace")
      mutations.push({
        kind: "setTaskDeleted",
        mutationID: randomUUID(),
        taskID: input.lifecycleTaskID,
        isDeleted: true,
      });
    mutations.push({
      kind: "ingestTask",
      mutationID: randomUUID(),
      task: {
        taskID,
        createdAtTimestampMillis: Date.now(),
        spec: spec(input.text),
        provenance: null,
      },
    });
    await vault.apply(mutations);
  } else if (command === "edit") {
    await vault.apply([
      {
        kind: "updateTaskSpec",
        mutationID: randomUUID(),
        taskID,
        spec: spec(input.text),
      },
    ]);
  } else if (command === "rollover") {
    const previous = vault.catalogURL;
    const before = (await vault.getReviewQueue()).map(
      ({ task, componentID }) => ({
        taskID: task.id,
        componentID,
        spec: task.spec,
      }),
    );
    const generation = await vault.rolloverCatalog();
    assert.notEqual(vault.catalogURL, previous);
    assert.ok(generation.generation > 0);
    assert.deepEqual(
      (await vault.getReviewQueue()).map(({ task, componentID }) => ({
        taskID: task.id,
        componentID,
        spec: task.spec,
      })),
      before,
      "Rollover changed the logical review queue",
    );
  } else throw new Error(`Unknown command: ${command}`);
  await flush(vault, storage, network);
  return {
    rootURL: vault.rootURL,
    catalogURL: vault.catalogURL,
    lifecycleTaskID: taskID,
  };
}

try {
  const command = process.argv[2];
  let input = "";
  if (command !== "serve")
    for await (const chunk of process.stdin) input += chunk;
  const result = await run(command, input ? JSON.parse(input) : {});
  if (result) console.log(JSON.stringify(result));
} finally {
  await repo?.shutdown();
  await service?.shutdown();
  await getFirestore(app).terminate();
  await deleteApp(app);
  await rm(scratch, { recursive: true, force: true });
}
