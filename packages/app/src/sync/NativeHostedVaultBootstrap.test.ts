import { expect, test } from "bun:test";
import {
  TaskContentType,
  TaskSpecType,
  defaultOrbitSchedulerPolicy,
  type AutomergeDocumentURL,
  type TaskID,
  type VaultID,
} from "@withorbit/core";
import {
  MemoryAutomergeBinaryStorage,
  BinaryPerTaskDocuments,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import type { NativePerTaskDocuments } from "../vault/nativePerTaskDocuments.js";
import { fakeNativeRepo } from "../vault/fakeNativeRepo.testSupport.js";
import { openBoundNativeHostedVault } from "./NativeHostedVaultBootstrap.js";
import type { NativeHostedSyncTransport } from "./NativeHostedSyncTransport.js";

test("a cached root with no local catalog connects before attempting the remote catalog", async () => {
  const fixture = await createFixture();
  const remoteCatalog = (await fixture.storage.load(fixture.vault.catalogURL))!;
  await fixture.storage.remove(fixture.vault.catalogURL);
  let connected = false;
  const events: string[] = [];
  const transport = transportFor(fixture.documents, {
    connect: async () => {
      connected = true;
      events.push("connect");
    },
    ensureDocument: async (url) => {
      // A local inspection must not enter a remote find or auth wait.
      expect(connected).toBe(true);
      events.push("ensure:" + url);
      if (url === fixture.vault.catalogURL)
        await fixture.storage.save(url, remoteCatalog);
      return Boolean(await fixture.storage.load(url));
    },
  });
  const unsubscribeOther = fixture.documents.subscribe(() => undefined);
  const result = await openFixture(fixture, transport);
  try {
    expect(events[0]).toBe("connect");
    expect(events).toContain("ensure:" + fixture.vault.catalogURL);
    expect(result.catalogURL).toBe(fixture.vault.catalogURL);
    // The failed local-only attempt removes its native observer before the
    // connected attempt installs the repository's observer.
    expect(fixture.documents.documentListenerCount()).toBe(2);
    expect(await result.getReviewQueue(0)).toEqual([]);
  } finally {
    await result.close();
    await fixture.vault.close();
  }
  expect(fixture.documents.documentListenerCount()).toBe(0);
  unsubscribeOther();
});

test("a complete local root/catalog opens without awaiting an offline connection", async () => {
  const fixture = await createFixture();
  const materialize = fixture.documents.materialize.bind(fixture.documents);
  const materialized: AutomergeDocumentURL[] = [];
  fixture.documents.materialize = async (url) => {
    materialized.push(url);
    return materialize(url);
  };
  let connections = 0;
  const transport = transportFor(fixture.documents, {
    connect: async () => {
      connections++;
      throw new Error("offline");
    },
    ensureDocument: async () => {
      throw new Error("No remote fetch needed");
    },
  });
  const result = await openFixture(fixture, transport);
  try {
    expect(connections).toBe(1);
    expect(await result.getReviewQueue(0)).toEqual([]);
    expect(materialized).toEqual([
      fixture.vault.rootURL,
      fixture.vault.catalogURL,
    ]);
  } finally {
    await result.close();
    await fixture.vault.close();
  }
});

test("cached prompts open offline when the selected queue's tail is missing", async () => {
  const fixture = await createFixture(3);
  const [, , headURL, secondURL, missingURL] =
    await fixture.vault.getCoreDocumentURLs();
  await fixture.storage.remove(missingURL);
  const materializeMany = fixture.documents.materializeMany.bind(
    fixture.documents,
  );
  const batches: AutomergeDocumentURL[][] = [];
  fixture.documents.materializeMany = async (urls) => {
    batches.push([...urls]);
    return materializeMany(urls);
  };
  const fetched: AutomergeDocumentURL[] = [];
  const transport = transportFor(fixture.documents, {
    connect: async () => {
      throw new Error("offline");
    },
    ensureDocument: async (url) => {
      fetched.push(url);
      throw new Error("offline");
    },
  });
  const result = await openFixture(fixture, transport);
  try {
    expect((await result.getReviewQueue(0)).map(({ task }) => task.id)).toEqual(
      ["native-bootstrap-0" as TaskID, "native-bootstrap-1" as TaskID],
    );
    expect(batches).toEqual([[headURL, secondURL]]);
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((url) => url === missingURL)).toBe(true);
    await expect(result.readLogicalVault()).rejects.toThrow("offline");
  } finally {
    await result.close();
    await fixture.vault.close();
  }
});

test("root and catalog with no locally readable prompt still await cold connection", async () => {
  const fixture = await createFixture(1);
  const [, , taskURL] = await fixture.vault.getCoreDocumentURLs();
  await fixture.storage.remove(taskURL);
  const transport = transportFor(fixture.documents, {
    connect: async () => {
      throw new Error("offline cold start");
    },
    ensureDocument: async () => false,
  });
  try {
    await expect(openFixture(fixture, transport)).rejects.toThrow(
      "offline cold start",
    );
  } finally {
    await fixture.vault.close();
  }
});

async function createFixture(taskCount = 0) {
  const storage = new MemoryAutomergeBinaryStorage();
  const vault = await PerTaskRepository.create(
    new BinaryPerTaskDocuments(storage),
    {
      vaultID: "native-bootstrap" as VaultID,
      createdAtTimestampMillis: 1_000,
      scheduler: defaultOrbitSchedulerPolicy,
      tasks: Object.fromEntries(
        Array.from({ length: taskCount }, (_, index) => [
          ("native-bootstrap-" + index) as TaskID,
          {
            createdAtTimestampMillis: 1_000 + index,
            spec: {
              type: TaskSpecType.Memory,
              content: {
                type: TaskContentType.Plain,
                body: { text: "Prompt " + index, attachments: [] },
              },
            },
            provenance: null,
            metadata: {},
            isDeleted: false,
          },
        ]),
      ),
      observations: {},
      attachments: {},
    },
  );
  const documents = fakeNativeRepo(storage);
  return { storage, documents, vault };
}

function transportFor(
  documents: NativePerTaskDocuments,
  operations: {
    connect(): Promise<void>;
    ensureDocument(url: AutomergeDocumentURL): Promise<boolean>;
  },
) {
  return {
    ...operations,
    documentChanged() {},
    async ensureDocuments(urls: AutomergeDocumentURL[]) {
      const present = await documents.containsMany(urls);
      return Promise.all(
        urls.map((url, index) =>
          present[index] ? true : operations.ensureDocument(url),
        ),
      );
    },
    async close() {},
  } as unknown as NativeHostedSyncTransport;
}

function openFixture(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  transport: NativeHostedSyncTransport,
) {
  return openBoundNativeHostedVault({
    entry: {
      token: "paired-key",
      serviceOrigin: "https://sync.example.test",
      localStoreID: "native-cache",
      rootDocumentURL: fixture.vault.rootURL,
    },
    requestCredential: async () => {
      throw new Error("Test transport owns auth");
    },
    transportFactory: () => transport,
    openDocuments: async () => fixture.documents,
    documentTimeoutMillis: 100,
  });
}
