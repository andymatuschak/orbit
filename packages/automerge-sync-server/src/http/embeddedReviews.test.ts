import { afterEach, expect, test } from "bun:test";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Repo, type PeerId } from "@automerge/automerge-repo";
import WebSocket from "ws";
import {
  maximumEmbeddedReviewBodyBytes,
  type EmbeddedReviewSubmission,
  type HostedVaultAccountRecord,
} from "@withorbit/api";
import {
  AttachmentMIMEType,
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  type AttachmentID,
  type ObservationID,
  type TaskID,
  type VaultMutationID,
} from "@withorbit/core";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { AuthenticatedWebSocketNetworkAdapter } from "../../../app/src/sync/AuthenticatedWebSocketNetworkAdapter.js";
import { InMemoryHostedVaultAccountStore } from "../accounts/inMemoryAccountStore.js";
import { configurationFromEnvironment } from "../config.js";
import { MemorySafeLogger } from "../logging/safeLogger.js";
import { HostedSyncService } from "../server.js";
import { accountStorageDirectory } from "../storage/accountStorage.js";
import {
  AtomicNodeFSStorageAdapter,
  StorageQuotaExceededError,
} from "../storage/atomicNodeFSStorageAdapter.js";
import { embeddedReviewObservationID } from "./embeddedReviews.js";

const taskID = "thin_embed_task_000001" as TaskID;
const attachmentID = "thin_embed_image_00001" as AttachmentID;
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4j8AAAAASUVORK5CYII=",
  "base64",
);
const allowedOrigin = "http://article.example.test";
const issuer = "https://securetoken.google.com/orbit-test";
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture(
  options: { quota?: number; requestsPerMinute?: number } = {},
) {
  const storageRoot = await mkdtemp(join(tmpdir(), "orbit-embedded-http-"));
  cleanups.push(() => rm(storageRoot, { recursive: true, force: true }));
  const accounts = new InMemoryHostedVaultAccountStore(
    ["alice", "bob"].map(
      (subject) =>
        ({
          schemaVersion: 1,
          authIssuer: issuer,
          authSubject: subject,
          emailAddress: `${subject}@example.test`,
          registrationTimestampMillis: 1000,
          hostedVaultID: subject,
          root: { status: "unbound" },
          migration: {
            mode: "automerge",
            source: "new-account",
            cutoverAtTimestampMillis: 1000,
            rollbackUntilTimestampMillis: null,
            legacyArchiveKey: null,
          },
          notificationMode: "pending",
        }) as HostedVaultAccountRecord,
    ),
  );
  const configuration = {
    ...configurationFromEnvironment({}),
    port: 0,
    storageRoot,
    allowedOrigins: new Set([allowedOrigin]),
    maximumControlRequestsPerMinute: options.requestsPerMinute ?? 120,
    maximumLoadedAccounts: 8,
  };
  const dependencies = {
    accounts,
    logger: new MemorySafeLogger(),
    verifier: {
      async verifyIDToken(token: string) {
        if (token !== "alice" && token !== "bob") throw new Error("Bad token");
        return {
          subject: token,
          issuer,
          expiresAtTimestampMillis: Date.now() + 60_000,
        };
      },
    },
  };
  let service = new HostedSyncService(configuration, dependencies);
  let address = await service.start();
  let origin = `http://127.0.0.1:${address.port}`;
  const post = (
    path: string,
    body: unknown,
    subject = "alice",
    headers: Record<string, string> = {},
  ) =>
    fetch(origin + "/v1/embedded/" + path, {
      method: "POST",
      headers: {
        Authorization: `ID ${subject}`,
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  if (options.quota) {
    expect((await post("projections", { taskIDs: [] })).status).toBe(200);
    await service.shutdown();
    service = new HostedSyncService(
      { ...configuration, maximumStorageBytesPerAccount: options.quota },
      dependencies,
    );
    address = await service.start();
    origin = `http://127.0.0.1:${address.port}`;
  }
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    try {
      await service.shutdown();
    } catch (error) {
      // The failing disk fixture must release resources without hiding unrelated failures.
      const errors = error instanceof AggregateError ? error.errors : [error];
      if (!(
        options.quota &&
        errors.every((failure) => failure instanceof StorageQuotaExceededError)
      ))
        throw error;
    }
  };
  cleanups.push(stop);
  const root = async (subject = "alice") => {
    const record = await accounts.getBySubject(subject);
    if (record?.root.status !== "bound") throw new Error("Missing test root");
    return record.root.documentURL;
  };
  const snapshot = async () => {
    const directory = join(storageRoot, "acknowledged-files");
    await cp(accountStorageDirectory(storageRoot, "alice"), directory, {
      recursive: true,
    });
    const repo = new Repo({
      storage: new AtomicNodeFSStorageAdapter(directory),
      network: [],
    });
    cleanups.push(() => repo.shutdown());
    const vault = await PerTaskRepository.open(
      new RepoPerTaskDocuments(repo),
      await root(),
    );
    cleanups.push(() => vault.close());
    return vault;
  };
  return {
    accounts,
    service,
    origin,
    post,
    root,
    snapshot,
    stop,
    logger: dependencies.logger,
  };
}

function review(
  overrides: Partial<EmbeddedReviewSubmission> = {},
): EmbeddedReviewSubmission {
  return {
    requestID: "request-1",
    sessionID: "session-1",
    taskID,
    componentID: "main",
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: 2000,
    taskSeed: {
      taskID,
      createdAtTimestampMillis: 1000,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: { text: "Question", attachments: [] },
          answer: { text: "Answer", attachments: [] },
        },
      },
      provenance: {
        identifier: allowedOrigin + "/one",
        title: "Article",
        url: allowedOrigin + "/one",
      },
    },
    ...overrides,
  };
}

test("uses ingress identity/CORS and isolates account roots including first-login binding", async () => {
  const { post, accounts } = await fixture();
  expect(
    (await post("reviews", { reviews: [review()] }, "invalid")).status,
  ).toBe(401);
  expect(
    (await post("reviews", { reviews: [review()], accountID: "bob" })).status,
  ).toBe(400);
  expect(
    (
      await post("reviews", { reviews: [review()] }, "alice", {
        Origin: "http://evil.example.test",
      })
    ).status,
  ).toBe(403);
  const response = await post("reviews", { reviews: [review()] }, "alice", {
    Origin: allowedOrigin,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
    allowedOrigin,
  );
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(
    (await (await post("projections", { taskIDs: [taskID] }, "bob")).json())
      .tasks,
  ).toEqual([]);
  expect(
    (await (await post("projections", { taskIDs: [taskID] })).json()).tasks,
  ).toHaveLength(1);
  const legacy = (await accounts.getBySubject("bob"))!;
  accounts.set({
    ...legacy,
    migration: { mode: "legacy" },
  } as HostedVaultAccountRecord);
  const refused = await post("reviews", { reviews: [review()] }, "bob");
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({ error: "legacy-account" });
});

test("concurrent first reviews and retries preserve one task and exactly the intended observations", async () => {
  const { post, snapshot } = await fixture();
  const first = review();
  const second = review({
    requestID: "request-2",
    occurredAtTimestampMillis: 3000,
    outcome: TaskRepetitionOutcome.Forgotten,
  });
  const results = await Promise.all(
    [first, first, second, first].map((item) =>
      post("reviews", { reviews: [item] }),
    ),
  );
  expect(results.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
  // Reusing a request ID for a different event cannot rewrite an accepted review.
  expect(
    (
      await post("reviews", {
        reviews: [review({ outcome: TaskRepetitionOutcome.Forgotten })],
      })
    ).status,
  ).toBe(503);
  const vault = await snapshot();
  const logical = await vault.readLogicalVault();
  expect(Object.keys(logical.tasks)).toEqual([taskID]);
  expect(Object.keys(logical.observations).sort()).toEqual(
    [first, second].map(embeddedReviewObservationID).sort(),
  );
  const observation = await vault.readTaskObservation(
    taskID,
    embeddedReviewObservationID(first),
  );
  expect(observation?.kind === "review" && observation.outcome).toBe(
    TaskRepetitionOutcome.Remembered,
  );
  expect(
    (await vault.getTaskProjections([taskID])).tasks.get(taskID)
      ?.componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(3000);
});

test("validates task/component input, attachment references and content before acknowledgement", async () => {
  const { post, snapshot } = await fixture();
  expect(
    (await post("reviews", { reviews: [review({ componentID: "unknown" })] }))
      .status,
  ).toBe(400);
  expect(
    (
      await post("reviews", {
        reviews: [
          review({
            taskSeed: {
              ...review().taskSeed,
              taskID: "different_task_00000001" as TaskID,
            },
          }),
        ],
      })
    ).status,
  ).toBe(400);
  const withImage = review();
  withImage.taskSeed.spec.content.body.attachments = [attachmentID];
  expect((await post("reviews", { reviews: [withImage] })).status).toBe(503);
  expect(
    (await (await post("projections", { taskIDs: [taskID] })).json()).tasks,
  ).toEqual([]);
  expect(
    (
      await post("reviews", {
        reviews: [withImage],
        attachments: [
          {
            attachmentID,
            mediaTypeHint: AttachmentMIMEType.SVG,
            bytesBase64: Buffer.from('<svg onload="alert(1)"/>').toString(
              "base64",
            ),
          },
        ],
      })
    ).status,
  ).toBe(400);
  const batch = {
    reviews: [withImage],
    attachments: [
      {
        attachmentID,
        mediaTypeHint: AttachmentMIMEType.PNG,
        bytesBase64: png.toString("base64"),
      },
    ],
  };
  const accepted = await post("reviews", batch);
  expect(accepted.status).toBe(200);
  expect((await accepted.json()).acceptedRequestIDs).toEqual([
    withImage.requestID,
  ]);
  expect((await post("reviews", batch)).status).toBe(200);
  expect(
    (
      await post("reviews", {
        ...batch,
        attachments: [
          {
            attachmentID,
            bytesBase64: Buffer.concat([png, Buffer.from([0])]).toString(
              "base64",
            ),
          },
        ],
      })
    ).status,
  ).toBe(503);
  expect((await post("reviews", { reviews: [withImage] })).status).toBe(200);
  // Freeze files at the acknowledgement boundary, before shutdown can save more.
  const vault = await snapshot();
  expect((await vault.readAttachment(attachmentID))?.bytes).toEqual(
    new Uint8Array(png),
  );
  expect(
    (await vault.getTaskProjections([taskID])).tasks.get(taskID)
      ?.componentStates.main.lastRepetitionTimestampMillis,
  ).toBe(2000);
});

test("body limits and real disk quota failures never acknowledge unsaved reviews", async () => {
  const { post } = await fixture({ quota: 128 });
  const failed = await post("reviews", { reviews: [review()] });
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({ error: "service-unavailable" });
  const oversized = await post("reviews", {
    reviews: [],
    padding: "x".repeat(maximumEmbeddedReviewBodyBytes),
  });
  expect(oversized.status).toBe(413);
  expect(await oversized.json()).toEqual({ error: "body-too-large" });
});

test("inherits the existing preflight restrictions and request rate limit", async () => {
  const { origin, post } = await fixture({ requestsPerMinute: 2 });
  const options = (headers: Record<string, string>) =>
    fetch(origin + "/v1/embedded/reviews", {
      method: "OPTIONS",
      headers: { Origin: allowedOrigin, ...headers },
    });
  expect(
    (
      await options({
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "authorization, content-type",
      })
    ).status,
  ).toBe(204);
  expect(
    (
      await options({
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "x-untrusted",
      })
    ).status,
  ).toBe(403);
  expect((await post("projections", { taskIDs: [] })).status).toBe(200);
  expect((await post("projections", { taskIDs: [] })).status).toBe(200);
  expect((await post("projections", { taskIDs: [] })).status).toBe(429);
});

test("HTTP changes converge with an ordinary already-open Repo peer in both directions", async () => {
  const { post, origin, root, logger, service } = await fixture();
  expect((await post("reviews", { reviews: [review()] })).status).toBe(200);
  const peer = new Repo({
    peerId: "embedded-http-independent-peer" as PeerId,
    isEphemeral: false,
    network: [],
    enableRemoteHeadsGossiping: true,
    shareConfig: { announce: async () => true, access: async () => true },
  });
  cleanups.push(() => peer.shutdown());
  const network = new AuthenticatedWebSocketNetworkAdapter(
    origin.replace("http:", "ws:") + "/v1/sync",
    async () => ({ kind: "firebaseIDToken", token: "alice" }),
    {
      retryIntervalMillis: 25,
      webSocketFactory: {
        create: (url) =>
          new WebSocket(url, {
            headers: { Origin: allowedOrigin },
          }) as unknown as globalThis.WebSocket,
      },
    },
  );
  peer.networkSubsystem.addNetworkAdapter(network);
  let admissionTimeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    network.whenReady(),
    new Promise<never>(
      (_, reject) =>
        (admissionTimeout = setTimeout(() => {
          void service
            .metrics()
            .then((metrics) =>
              reject(
                new Error(
                  "Admission timed out: " +
                    JSON.stringify({ metrics, log: logger.lines }),
                ),
              ),
            );
        }, 5_000)),
    ),
  ]).finally(() => clearTimeout(admissionTimeout));
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(peer),
    await root(),
  );
  cleanups.push(() => vault.close());
  const lastReview = async () =>
    (await vault.getTaskProjections([taskID])).tasks.get(taskID)
      ?.componentStates.main.lastRepetitionTimestampMillis;
  await eventually(lastReview, (time) => time === 2000);
  expect(
    (
      await post("reviews", {
        reviews: [
          review({ requestID: "request-3", occurredAtTimestampMillis: 3000 }),
        ],
      })
    ).status,
  ).toBe(200);
  await eventually(lastReview, (time) => time === 3000);
  await vault.apply([
    {
      kind: "recordReview",
      taskID,
      componentID: "main",
      mutationID: "peer-review" as VaultMutationID,
      observationID: "peer-review" as ObservationID,
      reviewSessionID: "ordinary-app-session",
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 4000,
    },
  ]);
  await eventually(
    async () =>
      (await (await post("projections", { taskIDs: [taskID] })).json()).tasks[0]
        ?.componentStates.main.lastRepetitionTimestampMillis,
    (time) => time === 4000,
  );
}, 20_000);

async function eventually<T>(
  read: () => Promise<T>,
  accepts: (value: T) => boolean,
) {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const value = await read();
    if (accepts(value)) return;
    if (Date.now() > deadline)
      throw new Error("Timed out awaiting Repo convergence");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
