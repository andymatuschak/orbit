import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as Automerge from "@automerge/automerge";
import {
  Repo,
  parseAutomergeUrl,
  type AutomergeUrl,
} from "@automerge/automerge-repo";
import {
  referencedAttachmentIDs,
  type AttachmentID,
  type AutomergeDocumentURL,
  type OrbitVault,
  type VaultID,
} from "@withorbit/core";
import {
  BinaryPerTaskDocuments,
  RepoPerTaskDocuments,
  encodeAttachmentDocument,
  verifyAttachmentBytes,
} from "@withorbit/store-automerge";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { canonicalJSONString } from "@withorbit/store-shared/taskMutationPlanner";
import { AtomicNodeFSStorageAdapter } from "../src/storage/atomicNodeFSStorageAdapter.js";
import { ensureStorageID } from "../src/storage/storageMetadata.js";

export interface PortableVault {
  vault: OrbitVault;
  attachmentBytes: Record<string, Uint8Array>;
}

/** Captured schema-2 AtomicFS bytes only. No source Repo, metadata initialization, repair or writes. */
export async function readCapturedVault(input: {
  storageRoot: string;
  rootDocumentURL: AutomergeDocumentURL;
}): Promise<PortableVault> {
  const storage = new AtomicNodeFSStorageAdapter(input.storageRoot);
  const documents = new BinaryPerTaskDocuments({
    load: async (url) => {
      const id = parseAutomergeUrl(url as unknown as AutomergeUrl).documentId;
      const chunks = [
        ...(await storage.loadRange([id, "snapshot"])),
        ...(await storage.loadRange([id, "incremental"])),
      ];
      if (!chunks.length) return undefined;
      const bytes = new Uint8Array(
        chunks.reduce((sum, { data }) => sum + data!.length, 0),
      );
      let offset = 0;
      for (const { data } of chunks) {
        bytes.set(data!, offset);
        offset += data!.length;
      }
      // This is the same snapshot-then-incremental ordering used by Repo storage loading.
      const doc = Automerge.loadIncremental(Automerge.init(), bytes);
      try {
        return Automerge.save(doc);
      } finally {
        Automerge.free(doc);
      }
    },
    save: async () => {
      throw new Error("Captured source is read-only");
    },
  });
  const repository = await PerTaskRepository.open(
    documents,
    input.rootDocumentURL,
  );
  try {
    const vault = await repository.readLogicalVault();
    const attachmentBytes: Record<string, Uint8Array> = {};
    for (const [id, descriptor] of Object.entries(vault.attachments))
      attachmentBytes[id] = (await documents.readAttachment(descriptor)).bytes;
    const source = { vault, attachmentBytes };
    await validateSource(source);
    return source;
  } finally {
    await repository.close();
    await storage.close();
  }
}

/** Only a new private directory is written. Publication/configuration is a separate setup step. */
export async function seedLabVault(input: {
  source: PortableVault;
  destination: string;
}) {
  await validateSource(input.source);
  const destination = await assertOutsideGit(path.resolve(input.destination));
  await fs.mkdir(destination, { mode: 0o700 }); // Refuse existing data rather than merge or replace it.
  const storage = new AtomicNodeFSStorageAdapter(destination);
  await ensureStorageID(storage);
  const repo = new Repo({ storage, network: [] });
  let repository: PerTaskRepository | undefined;
  try {
    const attachments: OrbitVault["attachments"] = {};
    for (const [id, descriptor] of Object.entries(
      input.source.vault.attachments,
    )) {
      const document = Automerge.from(
        encodeAttachmentDocument({
          documentType: "com.withorbit.attachment",
          schemaVersion: 1,
          bytes: input.source.attachmentBytes[id],
        }),
      );
      try {
        // Unlike ordinary content-addressed writes, initial isolation gets a fresh document URL.
        const handle = repo.import(Automerge.save(document));
        await repo.flush([handle.documentId]);
        attachments[id as AttachmentID] = {
          ...descriptor,
          documentURL: handle.url as unknown as AutomergeDocumentURL,
        };
      } finally {
        Automerge.free(document);
      }
    }
    repository = await PerTaskRepository.create(
      new RepoPerTaskDocuments(repo),
      {
        ...input.source.vault,
        vaultID: `lab-${randomUUID()}` as VaultID,
        attachments,
      },
    );
    const reopened = await repository.readLogicalVault();
    if (semanticDigest(reopened) !== semanticDigest(input.source.vault))
      throw new Error("Private seed differs from the captured logical vault");
    for (const [id, expected] of Object.entries(input.source.attachmentBytes)) {
      const actual = await repository.readAttachment(id as AttachmentID);
      if (!actual || !Buffer.from(actual.bytes).equals(Buffer.from(expected)))
        throw new Error("Private seed attachment verification failed");
    }
    await repo.flush();
    return {
      rootDocumentURL: repository.rootURL,
      vaultID: reopened.vaultID,
      ...vaultSummary(reopened),
    };
  } finally {
    await repository?.close();
    await repo.shutdown();
  }
}

export function vaultSummary(vault: OrbitVault) {
  const reviews = Object.entries(vault.observations)
    .filter(([, observation]) => observation.kind === "review")
    .sort(
      ([leftID, left], [rightID, right]) =>
        right.occurredAtTimestampMillis - left.occurredAtTimestampMillis ||
        leftID.localeCompare(rightID),
    );
  return {
    taskCount: Object.keys(vault.tasks).length,
    observationCount: Object.keys(vault.observations).length,
    reviewCount: reviews.length,
    attachmentCount: Object.keys(vault.attachments).length,
    attachmentBytes: Object.values(vault.attachments).reduce(
      (sum, attachment) => sum + attachment.byteLength,
      0,
    ),
    latestReviewTimestampMillis:
      reviews[0]?.[1].occurredAtTimestampMillis ?? null,
    latestReviewIDs: reviews.slice(0, 20).map(([id]) => id),
    semanticSHA256: semanticDigest(vault),
  };
}

function semanticDigest(vault: OrbitVault) {
  const attachments = Object.fromEntries(
    Object.entries(vault.attachments).map(
      ([id, { documentURL: _url, ...descriptor }]) => [id, descriptor],
    ),
  );
  return createHash("sha256")
    .update(
      canonicalJSONString({
        createdAtTimestampMillis: vault.createdAtTimestampMillis,
        scheduler: vault.scheduler,
        tasks: vault.tasks,
        observations: vault.observations,
        attachments,
      }),
    )
    .digest("hex");
}

async function validateSource(source: PortableVault) {
  for (const task of Object.values(source.vault.tasks))
    for (const id of referencedAttachmentIDs(task.spec))
      if (!source.vault.attachments[id])
        throw new Error("Source task references an unregistered attachment");
  for (const observation of Object.values(source.vault.observations))
    if (!source.vault.tasks[observation.taskID])
      throw new Error("Source observation references a missing task");
  for (const [id, descriptor] of Object.entries(source.vault.attachments)) {
    const bytes = source.attachmentBytes[id];
    if (!(bytes instanceof Uint8Array))
      throw new Error("Source attachment bytes are missing");
    await verifyAttachmentBytes({
      bytes,
      expectedHash: descriptor.hash,
      expectedByteLength: descriptor.byteLength,
      expectedMediaType: descriptor.mediaType,
    });
  }
}

export async function assertOutsideGit(destination: string) {
  const parentDirectory = await fs.realpath(path.dirname(destination));
  let ancestor = parentDirectory;
  for (;;) {
    try {
      await fs.stat(path.join(ancestor, ".git"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(ancestor);
      if (parent === ancestor)
        return path.join(parentDirectory, path.basename(destination));
      ancestor = parent;
      continue;
    }
    throw new Error("Private storage must be outside Git checkouts");
  }
}

export async function runLabSeed(args: readonly string[]) {
  const [action, ...rest] = args;
  if (action !== "seed" && action !== "export")
    throw new Error("Expected seed or export");
  const flags: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index],
      value = rest[index + 1];
    if (
      ![
        "--source",
        "--root",
        "--destination",
        "--output",
        "--vault-json",
      ].includes(flag) ||
      !value ||
      value.startsWith("--") ||
      flags[flag]
    )
      throw new Error("Invalid seed/export arguments");
    flags[flag] = value;
  }
  let source: PortableVault;
  if (flags["--vault-json"]) {
    if (flags["--source"] || flags["--root"])
      throw new Error("Choose one captured or JSON source");
    const json = JSON.parse(await fs.readFile(flags["--vault-json"], "utf8"));
    if (json.format !== "orbit-lab-vault-export" || json.version !== 1)
      throw new Error("Expected a portable Orbit Lab vault export");
    source = {
      vault: json.vault,
      attachmentBytes: Object.fromEntries(
        Object.entries(json.attachmentBytes as Record<string, string>).map(
          ([id, base64]) => [
            id,
            Uint8Array.from(Buffer.from(base64, "base64")),
          ],
        ),
      ),
    };
  } else {
    if (!flags["--source"] || !flags["--root"])
      throw new Error(
        "Expected --source <captured repo directory> --root <schema-2 URL>",
      );
    source = await readCapturedVault({
      storageRoot: flags["--source"],
      rootDocumentURL: flags["--root"] as AutomergeDocumentURL,
    });
  }
  if (action === "seed") {
    if (!flags["--destination"] || flags["--output"])
      throw new Error("Expected seed --destination <new private directory>");
    const destination = await assertOutsideGit(
      path.resolve(flags["--destination"]),
    );
    if (
      flags["--source"] &&
      destination.startsWith((await fs.realpath(flags["--source"])) + path.sep)
    )
      throw new Error("Seed destination cannot be inside the captured source");
    return seedLabVault({ source, destination });
  }
  if (!flags["--output"] || flags["--destination"])
    throw new Error("Expected export --output <new private JSON file>");
  const output = await assertOutsideGit(path.resolve(flags["--output"]));
  const file = await fs.open(output, "wx", 0o600);
  try {
    await file.writeFile(
      JSON.stringify({
        format: "orbit-lab-vault-export",
        version: 1,
        vault: source.vault,
        attachmentBytes: Object.fromEntries(
          Object.entries(source.attachmentBytes).map(([id, bytes]) => [
            id,
            Buffer.from(bytes).toString("base64"),
          ]),
        ),
      }),
    );
    await file.sync();
  } finally {
    await file.close();
  }
  return vaultSummary(source.vault);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.info(JSON.stringify(await runLabSeed(process.argv.slice(2))));
