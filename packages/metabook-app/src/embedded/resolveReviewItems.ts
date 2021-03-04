import { AttachmentIDReference } from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import { AttachmentResolutionMap } from "metabook-ui";
import { EmbeddedItem } from "../../../embedded-support/src/embeddedScreenInterface";
import serviceConfig from "../../serviceConfig";
import {
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";

// TODO: extract, generalize
async function fetchAttachmentResolution(
  urls: string[],
  referrer: string,
): Promise<{
  [key: string]:
    | { idReference: AttachmentIDReference }
    | { error: { name: string; message: string } };
}> {
  const attachmentURLParameterSegment = urls
    .map((url) => `attachmentURLs=${encodeURIComponent(url)}`)
    .join("&");

  const url = `${
    serviceConfig.httpsAPIBaseURLString
  }/internal/resolveAttachmentIDs?${attachmentURLParameterSegment}&referrer=${encodeURIComponent(
    referrer,
  )}`;
  const fetchResult = await fetch(url);
  if (!fetchResult.ok) {
    throw new Error(
      `Failed to resolve attachment URLs with status code ${
        fetchResult.status
      }: ${await fetchResult.text()}`,
    );
  }

  return await fetchResult.json();
}

async function resolveAttachments(
  embeddedItems: EmbeddedItem[],
  referrer: string,
): Promise<Map<string, AttachmentIDReference>> {
  const attachmentURLsToAttachmentIDReferences: Map<
    string,
    AttachmentIDReference
  > = new Map();

  const urls: Set<string> = new Set();
  for (const item of embeddedItems) {
    getAttachmentURLsInEmbeddedItem(item).forEach((url) => urls.add(url));
  }

  if (urls.size > 0) {
    const resolvedReferences = await fetchAttachmentResolution(
      [...urls],
      referrer,
    );

    for (const url of Object.keys(resolvedReferences)) {
      const result = resolvedReferences[url];
      if ("error" in result) {
        console.error(
          `Couldn't resolve attachment at ${url}: ${result.error.message}`,
        );
      } else {
        attachmentURLsToAttachmentIDReferences.set(url, result.idReference);
      }
    }
  }

  return attachmentURLsToAttachmentIDReferences;
}

// Resolve attachments (specified by URL) to their immutable IDs.
export async function resolveReviewItems(
  embeddedItems: EmbeddedItem[],
  referrer: string,
): Promise<ReviewItem[]> {
  const attachmentURLsToAttachmentIDReferences = await resolveAttachments(
    embeddedItems,
    referrer,
  );

  const attachmentResolutionMap: AttachmentResolutionMap = new Map(
    [
      ...attachmentURLsToAttachmentIDReferences.entries(),
    ].map(([url, idReference]) => [
      idReference.id,
      { type: idReference.type, url },
    ]),
  );

  const reviewItems: ReviewItem[] = [];
  for (const item of embeddedItems) {
    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: item,
      attachmentURLsToIDReferences: attachmentURLsToAttachmentIDReferences,
      attachmentResolutionMap: attachmentResolutionMap,
    });

    if (reviewItem instanceof Error) {
      console.error(`Skipping review item: ${reviewItem}`);
    } else {
      reviewItems.push(reviewItem);
    }
  }
  return reviewItems;
}
