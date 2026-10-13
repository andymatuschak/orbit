import * as Automerge from "@automerge/automerge";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import {
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
  defaultOrbitSchedulerPolicy,
  type AttachmentID,
  type AutomergeDocumentURL,
  type ObservationID,
  type OrbitVault,
  type TaskID,
  type VaultID,
  type VaultMutationID,
  type VaultMutation,
  type VaultAttachment,
} from "@withorbit/core";
import { expect, test } from "bun:test";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { decodePerTaskVaultTask } from "@withorbit/store-shared/perTaskCodec";
import { RepoPerTaskDocuments } from "../repoPerTaskDocuments.js";

test("new tasks are planned and created once with their first review already included", async () => {
  const storage = new ChunkStorage();
  const repo = new Repo({ storage });
  const documents = new RepoPerTaskDocuments(repo);
  const vault = await PerTaskRepository.create(documents, source(0));
  const created: unknown[] = [];
  const patched: AutomergeDocumentURL[] = [];
  const create = documents.create.bind(documents);
  const patch = documents.patch.bind(documents);
  documents.create = async (data, url) => {
    created.push(data);
    return create(data, url);
  };
  documents.patch = async (url, patches) => {
    patched.push(url);
    await patch(url, patches);
  };
  const seed = {
    taskID: id(0),
    ...source(1).tasks[id(0)],
  };
  const mutations: VaultMutation[] = [
    {
      kind: "ingestTask",
      mutationID: "new-task" as VaultMutationID,
      task: seed,
    },
    {
      kind: "mergeTaskMetadata",
      mutationID: "new-metadata" as VaultMutationID,
      taskID: id(0),
      metadata: { source: "final" },
    },
    {
      kind: "recordReview",
      mutationID: "new-review" as VaultMutationID,
      observationID: "new-review" as ObservationID,
      taskID: id(0),
      componentID: "main",
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 20_000,
    },
  ];
  try {
    await vault.apply(mutations);
    expect(created).toHaveLength(1);
    const task = decodePerTaskVaultTask(created[0]);
    expect(task.task.metadata).toEqual({ source: "final" });
    expect(Object.keys(task.observations)).toEqual(["new-review"]);
    expect(patched).toEqual([vault.catalogURL]);
    await vault.apply(mutations);
    expect(created).toHaveLength(1);
    expect((await vault.getProjection()).observationCount).toBe(1);
  } finally {
    await vault.close();
    await repo.shutdown();
  }
  const coldRepo = new Repo({ storage });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(coldRepo),
    vault.rootURL,
  );
  try {
    expect((await reopened.readLogicalVault()).tasks[id(0)].metadata).toEqual({
      source: "final",
    });
    expect((await reopened.getProjection()).observationCount).toBe(1);
  } finally {
    await reopened.close();
    await coldRepo.shutdown();
  }
});

test("catalog-only reads do not materialize task documents", async () => {
  const storage = new ChunkStorage();
  const initialRepo = new Repo({ storage });
  const initial = await PerTaskRepository.create(
    new RepoPerTaskDocuments(initialRepo),
    source(75),
  );
  const rootURL = initial.rootURL;
  await initial.close();
  await initialRepo.shutdown();
  const repo = new Repo({ storage });
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    rootURL,
  );
  try {
    expect(Object.keys(await vault.getCatalogEntries())).toHaveLength(75);
    expect(Object.keys(repo.handles)).toHaveLength(2);
  } finally {
    storage.failDocumentID = undefined;
    await vault.close();
    await repo.shutdown();
  }
  const coldRepo = new Repo({ storage });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(coldRepo),
    rootURL,
  );
  try {
    expect(Object.keys(await reopened.getCatalogEntries())).toHaveLength(75);
    expect(Object.keys(coldRepo.handles)).toHaveLength(2);
  } finally {
    await reopened.close();
    await coldRepo.shutdown();
  }
});

test("opening does not lose a root update while selecting its catalog", async () => {
  const repo = new Repo({ storage: new ChunkStorage() });
  const initial = await PerTaskRepository.create(
    new RepoPerTaskDocuments(repo),
    source(0),
  );
  const rootURL = initial.rootURL;
  const catalogURL = initial.catalogURL;
  await initial.close();
  const documents = new RepoPerTaskDocuments(repo);
  const read = documents.read.bind(documents);
  const attachmentID = "during-open" as AttachmentID;
  const attachment: VaultAttachment = {
    documentURL: rootURL,
    hash: ("sha256:" + "0".repeat(64)) as VaultAttachment["hash"],
    mediaType: "image/png",
    byteLength: 1,
  };
  let injected = false;
  documents.read = async (url, options) => {
    const result = await read(url, options);
    if (url === catalogURL && !injected) {
      injected = true;
      // The initial root snapshot is stale, but the opening listener sees this.
      await documents.patch(rootURL, [
        { kind: "put", path: ["attachments", attachmentID], value: attachment },
      ]);
    }
    return result;
  };
  const opened = await PerTaskRepository.open(documents, rootURL);
  try {
    expect((await opened.readLogicalVault()).attachments[attachmentID]).toEqual(
      attachment,
    );
  } finally {
    await opened.close();
    await repo.shutdown();
  }
});

test("unchanged opening reads root and catalog once and keeps one subscription", async () => {
  const storage = new ChunkStorage();
  const initialRepo = new Repo({ storage });
  const initial = await PerTaskRepository.create(
    new RepoPerTaskDocuments(initialRepo),
    source(75),
  );
  const rootURL = initial.rootURL;
  const catalogURL = initial.catalogURL;
  await initial.close();
  await initialRepo.shutdown();
  const repo = new Repo({ storage });
  const documents = new RepoPerTaskDocuments(repo);
  const read = documents.read.bind(documents);
  const reads = new Map<AutomergeDocumentURL, number>();
  documents.read = async (url, options) => {
    reads.set(url, (reads.get(url) ?? 0) + 1);
    return read(url, options);
  };
  const subscribe = documents.subscribe.bind(documents);
  let subscriptions = 0;
  let detached = 0;
  documents.subscribe = (listener) => {
    subscriptions++;
    const detach = subscribe(listener);
    return () => {
      detached++;
      detach();
    };
  };
  const opened = await PerTaskRepository.open(documents, rootURL);
  try {
    expect(await opened.getReviewWorkingSetDocumentURLs()).toHaveLength(52);
    expect(reads).toEqual(
      new Map([
        [rootURL, 1],
        [catalogURL, 1],
      ]),
    );
    expect(subscriptions).toBe(1);
    expect(detached).toBe(0);
  } finally {
    await opened.close();
    await repo.shutdown();
  }
  expect(detached).toBe(1);
});

test("idempotent review retries still await task durability before publishing the catalog", async () => {
  const storage = new ChunkStorage();
  const repo = new Repo({ storage });
  const vault = await PerTaskRepository.create(
    new RepoPerTaskDocuments(repo),
    source(1),
  );
  const rootURL = vault.rootURL;
  const catalog = (
    await repo.find(vault.catalogURL as unknown as AutomergeUrl)
  ).fullDoc() as {
    entries: Record<string, Automerge.ImmutableString>;
  };
  const { documentURL } = JSON.parse(catalog.entries[id(0)].toString()) as {
    documentURL: AutomergeDocumentURL;
  };
  const taskDocumentID = String(
    parseAutomergeUrl(documentURL as unknown as AutomergeUrl).documentId,
  );
  const catalogDocumentID = String(
    parseAutomergeUrl(vault.catalogURL as unknown as AutomergeUrl).documentId,
  );
  const flushed: string[] = [];
  const flush = repo.flush.bind(repo);
  repo.flush = async (ids) => {
    flushed.push(...(ids ?? []).map(String));
    await flush(ids);
  };
  const mutation: VaultMutation = {
    kind: "recordReview",
    mutationID: "retry-review" as VaultMutationID,
    observationID: "retry-review" as ObservationID,
    taskID: id(0),
    componentID: "main",
    reviewSessionID: null,
    outcome: TaskRepetitionOutcome.Remembered,
    occurredAtTimestampMillis: 20_000,
  };
  try {
    storage.failDocumentID = taskDocumentID;
    await expect(vault.apply([mutation])).rejects.toThrow(
      "document save(s) failed",
    );
    // The DocHandle already contains the observation, but it is not durable.
    expect(
      await vault.readTaskObservation(id(0), mutation.observationID),
    ).toMatchObject({ kind: "review" });
    await expect(vault.apply([mutation])).rejects.toThrow(
      "document save(s) failed",
    );
    expect(flushed).toEqual([taskDocumentID, taskDocumentID]);
    expect(flushed).not.toContain(catalogDocumentID);
    storage.failDocumentID = undefined;
    await vault.apply([mutation]);
    expect(flushed.slice(-2)).toEqual([taskDocumentID, catalogDocumentID]);
  } finally {
    storage.failDocumentID = undefined;
    await vault.close();
    await repo.shutdown();
  }
  const coldRepo = new Repo({ storage });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(coldRepo),
    rootURL,
  );
  try {
    const logical = await reopened.readLogicalVault();
    expect(Object.keys(logical.observations)).toEqual([mutation.observationID]);
  } finally {
    await reopened.close();
    await coldRepo.shutdown();
  }
});

test("idempotent attachment registration retries still await root durability", async () => {
  const storage = new ChunkStorage();
  const repo = new Repo({ storage });
  const vault = await PerTaskRepository.create(
    new RepoPerTaskDocuments(repo),
    source(0),
  );
  const rootURL = vault.rootURL;
  const mutation: VaultMutation = {
    kind: "registerAttachment",
    mutationID: "register-retry" as VaultMutationID,
    attachmentID: "test-attachment" as AttachmentID,
    attachment: {
      documentURL: rootURL,
      hash: ("sha256:" + "0".repeat(64)) as VaultAttachment["hash"],
      mediaType: "image/png",
      byteLength: 1,
    },
  };
  try {
    storage.failDocumentID = String(
      parseAutomergeUrl(rootURL as unknown as AutomergeUrl).documentId,
    );
    await expect(vault.apply([mutation])).rejects.toThrow(
      "document save(s) failed",
    );
    await expect(vault.apply([mutation])).rejects.toThrow(
      "document save(s) failed",
    );
    storage.failDocumentID = undefined;
    await vault.apply([mutation]);
  } finally {
    storage.failDocumentID = undefined;
    await vault.close();
    await repo.shutdown();
  }
  const coldRepo = new Repo({ storage });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(coldRepo),
    rootURL,
  );
  try {
    expect(
      (await reopened.readLogicalVault()).attachments[mutation.attachmentID],
    ).toEqual(mutation.attachment);
  } finally {
    await reopened.close();
    await coldRepo.shutdown();
  }
});

test("direct Repo reads stay queue-bounded and writes flush task before catalog without import/export", async () => {
  const storage = new ChunkStorage();
  const initialRepo = new Repo({ storage });
  const created = await PerTaskRepository.create(
    new RepoPerTaskDocuments(initialRepo),
    source(75),
  );
  const rootURL = created.rootURL;
  await created.close();
  await initialRepo.shutdown();

  const repo = new Repo({ storage });
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    rootURL,
  );
  // These are byte-oriented operational APIs. Normal reads/writes must not use them.
  repo.import = () => {
    throw new Error("Unexpected binary import");
  };
  repo.export = async () => {
    throw new Error("Unexpected binary export");
  };
  try {
    expect(await vault.getReviewQueue(10_000, 50)).toHaveLength(50);
    expect(Object.keys(repo.handles)).toHaveLength(52);
    const catalog = (
      await repo.find(vault.catalogURL as unknown as AutomergeUrl)
    ).fullDoc() as { entries: Record<string, Automerge.ImmutableString> };
    const entry = JSON.parse(catalog.entries[id(0)].toString()) as {
      documentURL: AutomergeDocumentURL;
    };
    const taskDocumentID = parseAutomergeUrl(
      entry.documentURL as unknown as AutomergeUrl,
    ).documentId;
    const catalogDocumentID = parseAutomergeUrl(
      vault.catalogURL as unknown as AutomergeUrl,
    ).documentId;
    const flushed: string[][] = [];
    const flush = repo.flush.bind(repo);
    repo.flush = async (ids) => {
      flushed.push((ids ?? []).map(String));
      await flush(ids);
    };

    await vault.apply([
      {
        kind: "recordReview",
        mutationID: "direct-review" as VaultMutationID,
        taskID: id(0),
        observationID: "direct-review" as ObservationID,
        componentID: "main",
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: 20_000,
      },
    ]);
    expect(flushed).toEqual([
      [String(taskDocumentID)],
      [String(catalogDocumentID)],
    ]);
    expect(
      await vault.readTaskObservation(id(0), "direct-review" as ObservationID),
    ).toMatchObject({ kind: "review" });
    expect(
      (await vault.getTaskProjections([id(0)])).tasks.get(id(0))
        ?.componentStates.main,
    ).toMatchObject({ lastRepetitionTimestampMillis: 20_000 });
  } finally {
    await vault.close();
    await repo.shutdown();
  }
});

test("direct Repo fails closed on authoritative scalar conflicts, not concurrent observation map keys", async () => {
  const repo = new Repo();
  const vault = await PerTaskRepository.create(
    new RepoPerTaskDocuments(repo),
    source(1),
  );
  try {
    const catalog = (
      await repo.find(vault.catalogURL as unknown as AutomergeUrl)
    ).fullDoc() as { entries: Record<string, Automerge.ImmutableString> };
    const { documentURL } = JSON.parse(catalog.entries[id(0)].toString()) as {
      documentURL: AutomergeDocumentURL;
    };
    const task = await repo.find<Record<string, any>>(
      documentURL as unknown as AutomergeUrl,
    );
    const base = task.fullDoc();
    let left = Automerge.clone(base, { actor: "aaaaaaaaaaaaaaaa" });
    let right = Automerge.clone(base, { actor: "bbbbbbbbbbbbbbbb" });
    left = Automerge.change(left, (draft) => {
      draft.observations.left = new Automerge.ImmutableString(
        JSON.stringify([
          "r",
          id(0),
          "main",
          20_000,
          null,
          TaskRepetitionOutcome.Remembered,
        ]),
      );
    });
    right = Automerge.change(right, (draft) => {
      draft.observations.right = new Automerge.ImmutableString(
        JSON.stringify([
          "r",
          id(0),
          "main",
          30_000,
          null,
          TaskRepetitionOutcome.Remembered,
        ]),
      );
    });
    task.update(() => Automerge.merge(left, right));
    expect((await vault.getProjection()).observationCount).toBe(2);
    left = Automerge.change(Automerge.clone(left), (draft) => {
      draft.task.metadata.source = new Automerge.ImmutableString("left");
    });
    right = Automerge.change(Automerge.clone(right), (draft) => {
      draft.task.metadata.source = new Automerge.ImmutableString("right");
    });
    task.update(() => Automerge.merge(left, right));
    await expect(vault.getTaskProjections([id(0)])).rejects.toThrow(
      "Projection stopped at Automerge conflicts",
    );
  } finally {
    await vault.close();
    await repo.shutdown();
  }
});

function id(index: number) {
  return ("direct-task-" + index) as TaskID;
}
function source(count: number): OrbitVault {
  return {
    vaultID: "direct-vault" as VaultID,
    createdAtTimestampMillis: 0,
    scheduler: defaultOrbitSchedulerPolicy,
    attachments: {},
    observations: {},
    tasks: Object.fromEntries(
      Array.from({ length: count }, (_, index) => [
        id(index),
        {
          createdAtTimestampMillis: index,
          isDeleted: false,
          provenance: null,
          metadata: {},
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.Plain,
              body: { text: "Task " + index, attachments: [] },
            },
          },
        },
      ]),
    ),
  };
}

class ChunkStorage {
  private readonly chunks = new Map<string, Uint8Array>();
  failDocumentID: string | undefined;
  async load(key: string[]) {
    return this.chunks.get(JSON.stringify(key));
  }
  async save(key: string[], bytes: Uint8Array) {
    if (key[0] === this.failDocumentID)
      throw new Error("injected persistence failure");
    this.chunks.set(JSON.stringify(key), Uint8Array.from(bytes));
  }
  async remove(key: string[]) {
    this.chunks.delete(JSON.stringify(key));
  }
  async loadRange(prefix: string[]) {
    return [...this.chunks].flatMap(([encoded, data]) => {
      const key = JSON.parse(encoded) as string[];
      return prefix.every((value, index) => key[index] === value)
        ? [{ key, data }]
        : [];
    });
  }
  async removeRange(prefix: string[]) {
    for (const { key } of await this.loadRange(prefix)) await this.remove(key);
  }
}
