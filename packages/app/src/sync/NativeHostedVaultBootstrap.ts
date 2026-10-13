import type { HostedSyncCredential } from "@withorbit/api";
import type { AutomergeDocumentURL } from "@withorbit/core";
import {
  CatalogUnavailableError,
  PerTaskRepository,
} from "@withorbit/store-shared/perTaskRepository";
import { openNativePerTaskDocuments } from "../vault/createRepo.js";
import type { NativePerTaskDocuments } from "../vault/nativePerTaskDocuments.js";
import type { LabConnection } from "../vault/labConnection.js";
import { NativeHostedSyncTransport } from "./NativeHostedSyncTransport.js";
import { hostedSyncWebSocketURL } from "./HostedVaultClient.js";

export async function openBoundNativeHostedVault(input: {
  entry: LabConnection;
  requestCredential: () => Promise<HostedSyncCredential>;
  transportFactory?: typeof createTransport;
  documentTimeoutMillis?: number;
  openDocuments?: typeof openNativePerTaskDocuments;
}): Promise<PerTaskRepository> {
  const bootstrapStartedAt = Date.now();
  const documents = await (input.openDocuments ?? openNativePerTaskDocuments)(
    input.entry.localStoreID,
  );
  let transport: NativeHostedSyncTransport | null = null;
  let vault: PerTaskRepository | null = null;
  try {
    transport = (input.transportFactory ?? createTransport)({
      documents,
      entry: input.entry,
      websocketURL: hostedSyncWebSocketURL(input.entry.serviceOrigin),
      requestCredential: input.requestCredential,
      documentTimeoutMillis: input.documentTimeoutMillis,
    });
    documents.transport = transport;
    let closure: AutomergeDocumentURL[] | null = null;
    const locallyAvailable = new Set<AutomergeDocumentURL>();
    if ((await documents.containsMany([input.entry.rootDocumentURL]))[0]) {
      // Confirm the selected working set is on disk before connecting. Repo
      // Swift observes and syncs each locally loaded document normally.
      transport.documentChanged(input.entry.rootDocumentURL);
      vault = await tryOpenNativeVault(input.entry, documents);
      if (vault) {
        closure = await vault.getCoreDocumentURLs();
        const presentDocuments = await documents.containsMany(closure);
        for (const [index, documentURL] of closure.entries()) {
          if (presentDocuments[index]) {
            locallyAvailable.add(documentURL);
            transport.documentChanged(documentURL);
          }
        }
      }
    }

    const localInspectionFinishedAt = Date.now();
    console.log(
      "[Performance] Hosted local store inspected in",
      localInspectionFinishedAt - bootstrapStartedAt,
      "ms",
    );
    const localWorkingSetIsUsable =
      closure !== null &&
      (closure.length === 2 ||
        closure
          .slice(2)
          .some((documentURL) => locallyAvailable.has(documentURL)));
    if (localWorkingSetIsUsable) {
      // Missing replenishment tasks do not veto readable local prompts. Keep
      // connecting and filling the working set without blocking offline launch.
      void transport.connect().catch(() => undefined);
    } else {
      await transport.connect();
    }
    console.log(
      "[Performance] Hosted transport ready in",
      Date.now() - localInspectionFinishedAt,
      "ms",
    );
    if (!vault) {
      const rootAvailable = await transport.ensureDocument(
        input.entry.rootDocumentURL,
        input.documentTimeoutMillis,
      );
      if (!rootAvailable) {
        throw new Error("Hosted Automerge root is unavailable");
      }
      vault = await openNativeVault(input.entry, documents);
      console.log(
        "[Performance] Hosted root and catalog opened in",
        Date.now() - localInspectionFinishedAt,
        "ms after local inspection",
      );
      closure = await vault.getCoreDocumentURLs();
      console.log(
        "[Performance] Hosted working set selected in",
        Date.now() - localInspectionFinishedAt,
        "ms after local inspection",
      );
    }
    if (!closure) {
      throw new Error("Native Repo did not resolve the vault document closure");
    }

    const missingDocuments = closure.filter(
      (documentURL) => !locallyAvailable.has(documentURL),
    );
    const fetchStartedAt = Date.now();
    const fetchWorkingSet = async () => {
      const available = await transport!.ensureDocuments(
        missingDocuments,
        input.documentTimeoutMillis,
      );
      console.log(
        "[Performance] Hosted document working set fetched",
        missingDocuments.length,
        "documents in",
        Date.now() - fetchStartedAt,
        "ms",
      );
      if (available.some((documentAvailable) => !documentAvailable))
        throw new Error("Hosted Automerge document closure is incomplete");
    };
    if (localWorkingSetIsUsable) void fetchWorkingSet().catch(() => undefined);
    else await fetchWorkingSet();
    return vault;
  } catch (error) {
    if (vault) await vault.close();
    else await documents.close();
    throw error;
  }
}

async function tryOpenNativeVault(
  entry: LabConnection,
  documents: NativePerTaskDocuments,
) {
  try {
    return await openNativeVault(entry, documents, true);
  } catch (error) {
    if (error instanceof CatalogUnavailableError) {
      return null;
    }
    throw error;
  }
}

async function openNativeVault(
  entry: { rootDocumentURL: AutomergeDocumentURL },
  documents: NativePerTaskDocuments,
  localOnly = false,
) {
  return PerTaskRepository.open(documents, entry.rootDocumentURL, undefined, {
    localOnly,
  });
}

function createTransport(input: {
  documents: NativePerTaskDocuments;
  entry: LabConnection;
  websocketURL: string;
  requestCredential: () => Promise<HostedSyncCredential>;
  documentTimeoutMillis?: number;
}) {
  return new NativeHostedSyncTransport(input.documents, {
    websocketURL: input.websocketURL,
    requestCredential: input.requestCredential,
    localStoreID: input.entry.localStoreID,
    documentTimeoutMillis: input.documentTimeoutMillis,
  });
}
