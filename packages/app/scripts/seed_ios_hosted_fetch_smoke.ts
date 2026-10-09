import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import * as Automerge from "@automerge/automerge";
import {
  generateAutomergeUrl,
  parseAutomergeUrl,
  Repo,
  type PeerId,
} from "@automerge/automerge-repo";
import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
  generateUniqueID,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type TaskID,
  type VaultID,
  type VaultMutationID,
} from "@withorbit/core";
import {
  MemoryAutomergeBinaryStorage,
  BinaryPerTaskDocuments,
  RepoAutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import {
  AtomicNodeFSStorageAdapter,
  accountStorageDirectory,
  ensureStorageID,
} from "@withorbit/automerge-sync-server";
import NodeWebSocket from "ws";

const bundleID = "com.withorbit.native";
const registryKey = "com.withorbit.vaultRegistry.v2";
const serviceOrigin = "http://127.0.0.1:8787";
const firebaseAPIKey = "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c";
const firebaseAppName = "[DEFAULT]";
const taskCount = Number(process.env.ORBIT_HOSTED_FETCH_TASK_COUNT ?? 10_867);
const firstPrompt = "Orbit hosted fetch smoke: first network task";
const secondPrompt = "Orbit hosted fetch smoke: second network task";
const thirdPrompt = "Hosted fetch scale task 00002";

function usage(): never {
  throw new Error(
    "Usage: seed_ios_hosted_fetch_smoke.ts prepare <Simulator app data container> <server storage root> <fixture.json> | wait-for-documents <Simulator app data container> <count> | verify <Simulator app data container> <expected prompt> [document count [task ID review ID]] | review-network <fixture.json> <expected prompt> <release file> | seed-conflict <Simulator app data container> <fixture.json> | wait-for-repair <Simulator app data container> <fixture.json>",
  );
}

class RepoSwiftFileStorage {
  constructor(private readonly root: string) {}

  async load(documentURL: AutomergeDocumentURL) {
    const directory = this.documentDirectory(documentURL);
    const snapshot = await readOptional(
      path.join(directory, "snapshot.automerge"),
    );
    const rangeDirectory = path.join(
      directory,
      "ranges",
      sha256(Buffer.from("incrChanges")),
    );
    const chunks = await readSortedRange(rangeDirectory);
    if (!snapshot && chunks.length === 0) return undefined;
    return Buffer.concat([snapshot ?? Buffer.alloc(0), ...chunks]);
  }

  async save(documentURL: AutomergeDocumentURL, bytes: Uint8Array) {
    const directory = this.documentDirectory(documentURL);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "snapshot.automerge"), bytes);
  }

  private documentDirectory(documentURL: AutomergeDocumentURL) {
    return path.join(
      this.root,
      parseAutomergeUrl(documentURL as never).documentId,
    );
  }
}

async function prepare(
  container: string,
  serverStorageRoot: string,
  fixturePath: string,
) {
  assertSimulatorContainer(container);
  if (!Number.isSafeInteger(taskCount) || taskCount < 100) {
    throw new Error("ORBIT_HOSTED_FETCH_TASK_COUNT must be at least 100");
  }
  const authentication = await createFixtureAuthentication();
  const accountID = `ios-hosted-fetch-${generateUniqueID()}`;
  const localStoreID = `vault-${generateUniqueID()}`;
  const memory = new MemoryAutomergeBinaryStorage();
  const taskURLs: Record<TaskID, AutomergeDocumentURL> = {};
  const tasks: OrbitVault["tasks"] = {};
  for (let index = 0; index < taskCount; index++) {
    const taskID = generateUniqueID() as TaskID;
    taskURLs[taskID] =
      generateAutomergeUrl() as unknown as AutomergeDocumentURL;
    tasks[taskID] = {
      createdAtTimestampMillis: 1_700_000_000_000 + index,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: {
            text:
              index === 0
                ? firstPrompt
                : index === 1
                  ? secondPrompt
                  : `Hosted fetch scale task ${index.toString().padStart(5, "0")}`,
            attachments: [],
          },
          answer: {
            text: `Network-fetched answer ${index}`,
            attachments: [],
          },
        },
      },
      provenance: null,
      metadata: { fixture: "ios-hosted-fetch-smoke" },
      isDeleted: false,
    };
  }
  const vault = await PerTaskRepository.create(
    new BinaryPerTaskDocuments(memory),
    {
      vaultID: "simulator-hosted-fetch-smoke" as VaultID,
      createdAtTimestampMillis: 1_700_000_000_000,
      scheduler: defaultOrbitSchedulerPolicy,
      tasks,
      observations: {},
      attachments: {},
    },
    { taskURLs },
  );
  const initialQueue = await vault.getReviewQueue(Date.now());
  if (
    initialQueue.length !== 50 ||
    initialQueue[0]?.task.spec.content.body.text !== firstPrompt
  ) {
    throw new Error(
      "Hosted-fetch fixture did not produce the expected first 50 tasks",
    );
  }

  const adapter = new AtomicNodeFSStorageAdapter(
    accountStorageDirectory(serverStorageRoot, accountID),
  );
  await ensureStorageID(adapter);
  const repo = new Repo({
    peerId: `orbit-ios-hosted-fetch-${randomUUID()}` as PeerId,
    isEphemeral: false,
    storage: adapter,
    saveDebounceRate: 0,
  });
  const serverStorage = new RepoAutomergeBinaryStorage(repo);
  const remotelyAvailable = [
    vault.rootURL,
    vault.catalogURL,
    ...Object.entries(tasks)
      .sort(
        ([leftID, left], [rightID, right]) =>
          left.createdAtTimestampMillis - right.createdAtTimestampMillis ||
          leftID.localeCompare(rightID),
      )
      .slice(0, 100)
      .map(([taskID]) => taskURLs[taskID as TaskID]),
  ];
  for (const documentURL of remotelyAvailable) {
    const bytes = await memory.load(documentURL);
    if (!bytes) throw new Error(`Missing generated document ${documentURL}`);
    await serverStorage.save(documentURL, bytes);
  }
  const catalogBytes = await memory.load(vault.catalogURL);
  if (!catalogBytes || catalogBytes.byteLength < 900_000) {
    throw new Error(
      `Hosted-fetch catalog is too small to represent production: ${catalogBytes?.byteLength ?? 0} bytes`,
    );
  }
  await serverStorage.close();
  await repo.flush();
  await repo.shutdown();
  await adapter.close();

  const localStorage = new RepoSwiftFileStorage(
    storageRoot(container, localStoreID),
  );
  const rootBytes = await memory.load(vault.rootURL);
  if (!rootBytes) throw new Error("Generated root is missing");
  await localStorage.save(vault.rootURL, rootBytes);
  await writeAsyncStorageItems(container, {
    [`firebase:authUser:${firebaseAPIKey}:${firebaseAppName}`]: JSON.stringify(
      authentication.persistedUser,
    ),
    [registryKey]: JSON.stringify({
      schemaVersion: 2,
      hostedVaults: [
        {
          kind: "hosted",
          authenticationUserID: authentication.userID,
          accountID: authentication.userID,
          serviceOrigin,
          rootDocumentURL: vault.rootURL,
          localStoreID,
        },
      ],
    }),
  });
  await writeFile(
    fixturePath,
    JSON.stringify({
      accountID,
      authenticationUserID: authentication.userID,
      rootDocumentURL: vault.rootURL,
      storageRoot: serverStorageRoot,
      catalogByteLength: catalogBytes.byteLength,
      remotelyAvailableDocumentCount: remotelyAvailable.length,
      catalogDocumentURL: vault.catalogURL,
      repairTaskID: Object.keys(tasks)[99],
      repairTaskDocumentURL: taskURLs[Object.keys(tasks)[99] as TaskID],
    }),
  );
  console.log(
    `Prepared root-only client and ${catalogBytes.byteLength}-byte hosted catalog with ${taskCount} entries`,
  );
}

async function catalogRepairFixture(container: string, fixturePath: string) {
  assertSimulatorContainer(container);
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  const registry = await readRegistry(container);
  const entry = registry.hostedVaults.find(
    (candidate: { serviceOrigin?: string }) =>
      candidate.serviceOrigin === serviceOrigin,
  );
  if (!entry?.localStoreID) throw new Error("Missing hosted fixture registry");
  return {
    fixture,
    storage: new RepoSwiftFileStorage(
      storageRoot(container, entry.localStoreID),
    ),
  };
}

async function seedConflict(container: string, fixturePath: string) {
  const { fixture, storage } = await catalogRepairFixture(
    container,
    fixturePath,
  );
  if (await storage.load(fixture.repairTaskDocumentURL)) {
    throw new Error("Repair regression needs a task that is not already local");
  }
  const bytes = await storage.load(fixture.catalogDocumentURL);
  if (!bytes) throw new Error("Missing local catalog");
  const base = Automerge.load<{
    entries: Record<string, Automerge.ImmutableString>;
  }>(bytes);
  const taskID = fixture.repairTaskID;
  // Both strings decode to the same entry. Concurrent writes reproduce a real
  // catalog conflict; normal opening must repair it from the remote task.
  const left = Automerge.change(Automerge.clone(base), (doc) => {
    doc.entries[taskID] = new Automerge.ImmutableString(
      `${doc.entries[taskID]} `,
    );
  });
  const right = Automerge.change(Automerge.clone(base), (doc) => {
    doc.entries[taskID] = new Automerge.ImmutableString(
      `${doc.entries[taskID]}\n`,
    );
  });
  const conflicted = Automerge.merge(left, right);
  if (!Automerge.getConflicts(conflicted.entries, taskID)) {
    throw new Error("Fixture did not create a catalog conflict");
  }
  await storage.save(fixture.catalogDocumentURL, Automerge.save(conflicted));
  console.log("Seeded catalog conflict with a remote-only repair task");
}

async function waitForRepair(container: string, fixturePath: string) {
  const { fixture, storage } = await catalogRepairFixture(
    container,
    fixturePath,
  );
  for (let attempt = 0; attempt < 300; attempt++) {
    const bytes = await storage.load(fixture.catalogDocumentURL);
    if (bytes && (await storage.load(fixture.repairTaskDocumentURL))) {
      const catalog = Automerge.load<{ entries: Record<string, string> }>(
        bytes,
      );
      const conflicts = Automerge.getConflicts(
        catalog.entries,
        fixture.repairTaskID,
      );
      Automerge.free(catalog);
      if (!conflicts) {
        console.log(
          "Verified remote-only task fetched and catalog conflict repaired without relaunch",
        );
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    "Catalog repair did not fetch its remote-only task within 30 seconds",
  );
}

async function verify(
  container: string,
  expectedPrompt: string,
  expectedDocumentCount = 53,
  expectedReview?: { taskID: TaskID; observationID: ObservationID },
) {
  assertSimulatorContainer(container);
  const registry = await readRegistry(container);
  const entry = registry.hostedVaults?.find(
    (candidate: { serviceOrigin?: string }) =>
      candidate.serviceOrigin === serviceOrigin,
  );
  if (!entry?.rootDocumentURL || !entry.localStoreID) {
    throw new Error("The hosted-fetch fixture is absent from the registry");
  }
  const root = storageRoot(container, entry.localStoreID);
  const localDocumentCount = (
    await readdir(root, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory()).length;
  if (localDocumentCount !== expectedDocumentCount) {
    throw new Error(
      `Expected ${expectedDocumentCount} working-set documents; found ${localDocumentCount}`,
    );
  }
  const vault = await PerTaskRepository.open(
    new BinaryPerTaskDocuments(new RepoSwiftFileStorage(root)),
    entry.rootDocumentURL as AutomergeDocumentURL,
  );
  // Inspect the earliest authoritative prompt, not a fresh network-sized
  // window. This verifier has only the stopped app's ordinary files.
  const visibleText = (await vault.getReviewQueue(undefined, 1))[0]?.task.spec
    .content.body.text;
  if (visibleText !== expectedPrompt) {
    throw new Error(
      `Expected next prompt ${JSON.stringify(expectedPrompt)}; found ${JSON.stringify(visibleText)}`,
    );
  }
  if (expectedReview) {
    const observation = await vault.readTaskObservation(
      expectedReview.taskID,
      expectedReview.observationID,
    );
    if (
      !observation ||
      observation.reviewSessionID !== "WIDGET" ||
      observation.outcome !== TaskRepetitionOutcome.Remembered
    ) {
      throw new Error("The widget review was not durably stored in its task");
    }
    console.log(
      `Verified durable widget observation ${expectedReview.observationID}`,
    );
  }
  console.log(
    `Verified cold hosted fetch persisted ${localDocumentCount} narrow working-set documents; next prompt: ${visibleText}`,
  );
}

async function waitForDocumentCount(container: string, expectedCount: number) {
  assertSimulatorContainer(container);
  const registry = await readRegistry(container);
  const entry = registry.hostedVaults?.find(
    (candidate: { serviceOrigin?: string }) =>
      candidate.serviceOrigin === serviceOrigin,
  );
  if (!entry?.localStoreID) {
    throw new Error("The hosted-fetch fixture is absent from the registry");
  }
  const root = storageRoot(container, entry.localStoreID);
  for (let attempt = 0; attempt < 100; attempt++) {
    const count = (await readdir(root, { withFileTypes: true })).filter(
      (candidate) => candidate.isDirectory(),
    ).length;
    if (count >= expectedCount) {
      console.log(`Hosted working set contains ${count} documents`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Hosted working set did not reach ${expectedCount} documents`,
  );
}

async function reviewNetwork(
  fixturePath: string,
  expectedPrompt: string,
  releasePath: string,
) {
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as {
    rootDocumentURL: AutomergeDocumentURL;
  };
  const authentication = await signInFixtureUser(
    `orbit-ios-hosted-fetch-remote-auth-${randomUUID()}`,
  );
  const firebaseIDToken = await authentication.user.getIdToken();
  const previousWebSocket = globalThis.WebSocket;
  class AuthenticatedNodeWebSocket extends NodeWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols, {
        headers: { Authorization: `ID ${firebaseIDToken}` },
      });
    }
  }
  globalThis.WebSocket =
    AuthenticatedNodeWebSocket as unknown as typeof globalThis.WebSocket;
  const network = new WebSocketClientAdapter("ws://127.0.0.1:8787/v1/sync");
  const repo = new Repo({
    peerId: `orbit-ios-hosted-fetch-remote-${randomUUID()}` as PeerId,
    isEphemeral: true,
    network: [network],
  });
  const storage = new RepoAutomergeBinaryStorage(repo);
  try {
    await network.whenReady();
    const vault = await PerTaskRepository.open(
      new BinaryPerTaskDocuments(storage),
      fixture.rootDocumentURL,
    );
    const item = (await vault.getReviewQueue())[0];
    const prompt = item?.task.spec.content.body.text;
    if (!item || prompt !== expectedPrompt) {
      throw new Error(
        `Expected network-client prompt ${JSON.stringify(expectedPrompt)}; found ${JSON.stringify(prompt)}`,
      );
    }
    const id = generateUniqueID();
    await vault.apply([
      {
        kind: "recordReview",
        mutationID: `remote-mutation-${id}` as VaultMutationID,
        taskID: item.task.id,
        observationID: `remote-observation-${id}` as ObservationID,
        componentID: item.componentID,
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: Date.now(),
      },
    ]);
    const nextPrompt = (await vault.getReviewQueue())[0]?.task.spec.content.body
      .text;
    if (nextPrompt !== thirdPrompt) {
      throw new Error(
        `Expected network review to advance to ${JSON.stringify(thirdPrompt)}; found ${JSON.stringify(nextPrompt)}`,
      );
    }
    console.log(`Advanced network client review to: ${nextPrompt}`);
    // Repo.apply acknowledges the local Automerge mutation, not delivery to a
    // remote peer. The parent smoke test releases this second client only
    // after the already-connected native UI observes the change, avoiding an
    // arbitrary sleep or a disconnect race with an in-flight WebSocket send.
    for (let attempt = 0; attempt < 600; attempt++) {
      try {
        await access(releasePath);
        break;
      } catch {
        if (attempt === 599) {
          throw new Error("Timed out waiting to release network review client");
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    await vault.close();
  } finally {
    network.disconnect();
    await storage.close();
    await repo.shutdown();
    await deleteApp(authentication.app);
    globalThis.WebSocket = previousWebSocket;
  }
}

async function createFixtureAuthentication() {
  const authentication = await signInFixtureUser(
    "orbit-ios-hosted-fetch-smoke-seeder",
  );
  try {
    const persistedUser = (
      authentication.user as unknown as { toJSON(): Record<string, unknown> }
    ).toJSON();
    persistedUser.appName = firebaseAppName;
    persistedUser.apiKey = firebaseAPIKey;
    return { userID: authentication.user.uid, persistedUser };
  } finally {
    await deleteApp(authentication.app);
  }
}

async function signInFixtureUser(appName: string) {
  const app = initializeApp(
    {
      apiKey: firebaseAPIKey,
      authDomain: "metabook-system.firebaseapp.com",
      projectId: "metabook-system",
    },
    appName,
  );
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    let credential;
    try {
      credential = await signInWithEmailAndPassword(
        auth,
        "test@test.com",
        "testtest",
      );
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "auth/user-not-found"
      ) {
        throw error;
      }
      credential = await createUserWithEmailAndPassword(
        auth,
        "test@test.com",
        "testtest",
      );
    }
    return { app, user: credential.user };
  } catch (error) {
    await deleteApp(app);
    throw error;
  }
}

function appSupportDirectory(container: string) {
  return path.join(container, "Library", "Application Support");
}

function storageRoot(container: string, storeID: string) {
  return path.join(
    appSupportDirectory(container),
    "Orbit",
    "Automerge",
    "repos",
    sha256(Buffer.from(storeID)),
  );
}

async function writeAsyncStorageItems(
  container: string,
  items: Record<string, string>,
) {
  const manifestPath = asyncStorageManifestPath(container);
  const storageDirectory = path.dirname(manifestPath);
  await mkdir(storageDirectory, { recursive: true });
  const manifest = JSON.parse(
    (await readOptional(manifestPath))?.toString("utf8") ?? "{}",
  ) as Record<string, string | null>;
  for (const [key, value] of Object.entries(items)) {
    if (Buffer.byteLength(value, "utf8") <= 1_024) {
      manifest[key] = value;
    } else {
      manifest[key] = null;
      await writeFile(path.join(storageDirectory, md5(key)), value, "utf8");
    }
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
}

async function readRegistry(container: string) {
  const manifest = JSON.parse(
    await readFile(asyncStorageManifestPath(container), "utf8"),
  ) as Record<string, string | null>;
  const serialized = manifest[registryKey];
  if (!serialized) throw new Error("The vault registry is missing");
  return JSON.parse(serialized) as {
    hostedVaults?: {
      localStoreID?: string;
      rootDocumentURL?: string;
      serviceOrigin?: string;
    }[];
  };
}

function asyncStorageManifestPath(container: string) {
  return path.join(
    appSupportDirectory(container),
    bundleID,
    "RCTAsyncLocalStorage_V1",
    "manifest.json",
  );
}

async function readOptional(filename: string): Promise<Buffer | null> {
  try {
    return await readFile(filename);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readSortedRange(directory: string) {
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    names
      .filter((name) => name.endsWith(".amchange"))
      .sort()
      .map((name) => readFile(path.join(directory, name))),
  );
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function md5(value: string) {
  return createHash("md5").update(value).digest("hex");
}

function assertSimulatorContainer(container: string) {
  if (!path.isAbsolute(container) || !container.includes("/CoreSimulator/")) {
    throw new Error(`Refusing non-Simulator app container: ${container}`);
  }
}

async function main() {
  const [command, ...arguments_] = process.argv.slice(2);
  if (command === "prepare" && arguments_.length === 3) {
    await prepare(arguments_[0], arguments_[1], arguments_[2]);
  } else if (command === "wait-for-documents" && arguments_.length === 2) {
    await waitForDocumentCount(arguments_[0], Number(arguments_[1]));
  } else if (command === "verify" && [2, 3, 5].includes(arguments_.length)) {
    await verify(
      arguments_[0],
      arguments_[1],
      arguments_[2] === undefined ? 53 : Number(arguments_[2]),
      arguments_.length === 5
        ? {
            taskID: arguments_[3] as TaskID,
            observationID: arguments_[4] as ObservationID,
          }
        : undefined,
    );
  } else if (command === "review-network" && arguments_.length === 3) {
    await reviewNetwork(arguments_[0], arguments_[1], arguments_[2]);
  } else if (command === "seed-conflict" && arguments_.length === 2) {
    await seedConflict(arguments_[0], arguments_[1]);
  } else if (command === "wait-for-repair" && arguments_.length === 2) {
    await waitForRepair(arguments_[0], arguments_[1]);
  } else {
    usage();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
