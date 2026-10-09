import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseAutomergeUrl } from "@automerge/automerge-repo";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  inMemoryPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  TaskContentType,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
  generateUniqueID,
  type AutomergeDocumentURL,
  type OrbitVault,
  type TaskID,
  type VaultID,
  type VaultMutation,
  type VaultMutationID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  type AutomergeBinaryStorage,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";

const bundleID = "com.withorbit.native";
const registryKey = "com.withorbit.vaultRegistry.v2";
const localStoreID = `vault-${generateUniqueID()}`;
const serviceOrigin = "http://127.0.0.1:8787";
const firebaseAPIKey = "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c";
const firebaseAppName = "[DEFAULT]";
const prompts = [
  "Orbit review smoke test: first durable write",
  "Orbit review smoke test: second durable write",
  "Orbit review smoke test: persisted after relaunch",
] as const;

function usage(): never {
  throw new Error(
    "Usage: seed_ios_review_smoke.ts seed|verify <Simulator app data container> [expected observation count]",
  );
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

class RepoSwiftFileStorage implements AutomergeBinaryStorage {
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
      parseAutomergeUrl(
        documentURL as unknown as Parameters<typeof parseAutomergeUrl>[0],
      ).documentId,
    );
  }
}

async function seed(container: string) {
  assertSimulatorContainer(container);
  const fixtureAuthentication = await createFixtureAuthentication();
  const authenticationUserID = fixtureAuthentication.userID;
  const storage = new RepoSwiftFileStorage(
    storageRoot(container, localStoreID),
  );
  const vaultID = "simulator-review-smoke" as VaultID;
  const vault = await PerTaskRepository.create(
    new BinaryPerTaskDocuments(storage),
    {
      vaultID,
      createdAtTimestampMillis: 1_700_000_000_000,
      scheduler: defaultOrbitSchedulerPolicy,
      tasks: {},
      observations: {},
      attachments: {},
    } satisfies OrbitVault,
  );
  await vault.apply(
    prompts.map((prompt, index): VaultMutation => ({
      kind: "ingestTask",
      mutationID: `simulator/ingest/${index}` as VaultMutationID,
      task: {
        taskID: generateUniqueID() as TaskID,
        createdAtTimestampMillis: 1_700_000_000_000 + index,
        spec: {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: prompt, attachments: [] },
            answer: {
              text: `Answer ${index + 1}: this came from the ordinary Automerge store.`,
              attachments: [],
            },
          },
        },
        provenance: null,
        metadata: { fixture: "ios-review-smoke-v2" },
      },
    })),
  );

  await writeAsyncStorageItems(container, {
    [`firebase:authUser:${firebaseAPIKey}:${firebaseAppName}`]: JSON.stringify(
      fixtureAuthentication.persistedUser,
    ),
    [registryKey]: JSON.stringify({
      schemaVersion: 2,
      hostedVaults: [
        {
          kind: "hosted",
          authenticationUserID,
          accountID: authenticationUserID,
          serviceOrigin,
          rootDocumentURL: vault.rootURL,
          localStoreID,
        },
      ],
    }),
  });
  console.log(
    JSON.stringify({
      authenticationUserID,
      localStoreID,
      rootDocumentURL: vault.rootURL,
      prompts,
    }),
  );
}

async function verify(container: string, expectedObservationCount: number) {
  assertSimulatorContainer(container);
  const registry = await readRegistry(container);
  const entry = registry.hostedVaults?.find(
    (candidate: { serviceOrigin?: string }) =>
      candidate.serviceOrigin === serviceOrigin,
  );
  if (!entry?.rootDocumentURL || !entry.localStoreID) {
    throw new Error("The simulator review vault is absent from the registry");
  }
  const storage = new RepoSwiftFileStorage(
    storageRoot(container, entry.localStoreID),
  );
  const vault = await PerTaskRepository.open(
    new BinaryPerTaskDocuments(storage),
    entry.rootDocumentURL as AutomergeDocumentURL,
  );
  const projection = await vault.getProjection();
  if (projection.observationCount !== expectedObservationCount) {
    throw new Error(
      `Expected ${expectedObservationCount} durable observations; found ${projection.observationCount}`,
    );
  }
  const queue = await vault.getReviewQueue();
  const visibleText = queue[0]?.task.spec.content.body.text;
  if (visibleText !== prompts[expectedObservationCount]) {
    throw new Error(
      `Expected next prompt ${JSON.stringify(prompts[expectedObservationCount])}; found ${JSON.stringify(visibleText)}`,
    );
  }
  console.log(
    `Verified ${projection.observationCount} durable reviews; next prompt: ${visibleText}`,
  );
}

async function createFixtureAuthentication() {
  const app = initializeApp(
    {
      apiKey: firebaseAPIKey,
      authDomain: "metabook-system.firebaseapp.com",
      projectId: "metabook-system",
    },
    "orbit-ios-review-smoke-seeder",
  );
  try {
    const auth = initializeAuth(app, { persistence: inMemoryPersistence });
    connectAuthEmulator(auth, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    const credential = await signInWithEmailAndPassword(
      auth,
      "test@test.com",
      "testtest",
    );
    const persistedUser = (
      credential.user as unknown as { toJSON(): Record<string, unknown> }
    ).toJSON();
    // The seeder uses a named Firebase app; the iOS app uses the default name.
    persistedUser.appName = firebaseAppName;
    persistedUser.apiKey = firebaseAPIKey;
    return { userID: credential.user.uid, persistedUser };
  } finally {
    await deleteApp(app);
  }
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
  return await Promise.all(
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
  const [command, container, count] = process.argv.slice(2);
  if (!command || !container) usage();
  if (command === "seed") {
    await seed(container);
  } else if (command === "verify") {
    const expected = Number(count);
    if (!Number.isSafeInteger(expected) || expected < 0) usage();
    await verify(container, expected);
  } else {
    usage();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
