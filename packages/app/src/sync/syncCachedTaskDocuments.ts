import type { AutomergeDocumentURL } from "@withorbit/core";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";

const batchSize = 32;
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Register cached histories too, not only the first review queue. No remote discovery. */
export async function syncCachedTaskDocuments(
  vault: Pick<PerTaskRepository, "getCatalogEntries" | "isClosed">,
  containsMany: (urls: readonly AutomergeDocumentURL[]) => Promise<boolean[]>,
  enroll: (urls: readonly AutomergeDocumentURL[]) => Promise<void>,
): Promise<void> {
  try {
    // Even catalog inspection is deliberately off the local-first opening path.
    await yieldToUI();
    if (vault.isClosed) return;
    const entries = await vault.getCatalogEntries();
    const urls = [
      ...new Set(Object.values(entries).map((entry) => entry.documentURL)),
    ];
    await inDocumentBatches(
      urls,
      async (batch) => {
        const present = await containsMany(batch);
        if (vault.isClosed) return;
        const local = batch.filter((_, index) => present[index]);
        if (local.length) await enroll(local);
      },
      () => vault.isClosed,
    );
  } catch (error) {
    // Closing can race with a storage read; that is cancellation, not a failure.
    if (!vault.isClosed) throw error;
  }
}

export async function inDocumentBatches(
  urls: readonly AutomergeDocumentURL[],
  visit: (batch: readonly AutomergeDocumentURL[]) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  for (let offset = 0; offset < urls.length; offset += batchSize) {
    await yieldToUI();
    if (shouldStop()) return;
    await visit(urls.slice(offset, offset + batchSize));
    if (shouldStop()) return;
  }
}
