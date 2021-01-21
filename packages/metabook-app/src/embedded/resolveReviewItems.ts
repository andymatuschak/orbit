import {
  AttachmentIDReference,
  getAttachmentMimeTypeFromResourceMetadata,
  getAttachmentTypeForAttachmentMimeType,
  getIDForAttachment,
} from "metabook-core";
import { ReviewItem } from "metabook-embedded-support";
import { AttachmentResolutionMap } from "metabook-ui";
import { EmbeddedItem } from "../../../embedded-support/src/embeddedScreenInterface";
import {
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";

async function fetchAttachment(url: string): Promise<AttachmentIDReference> {
  // TODO: move all this to a server call
  const response = await fetch(url);
  const responseIsOK = response.status >= 200 && response.status < 300;
  if (!responseIsOK) {
    throw new Error(
      `Error retrieving attachment at ${url}: ${response.status} ${response.type}`,
    );
  }

  const contentType = response.headers.get("Content-Type");
  const attachmentMimeType = getAttachmentMimeTypeFromResourceMetadata(
    contentType,
    url,
  );
  if (!attachmentMimeType) {
    throw new Error(
      `Attachment at ${url} has unsupported MIME type ${contentType} and unsupported extension`,
    );
  }

  const attachmentData = await response.arrayBuffer();
  const attachmentID = await getIDForAttachment(new Uint8Array(attachmentData));

  return {
    id: attachmentID,
    byteLength: attachmentData.byteLength,
    type: getAttachmentTypeForAttachmentMimeType(attachmentMimeType),
  };
}

async function resolveAttachments(
  embeddedItems: EmbeddedItem[],
): Promise<Map<string, AttachmentIDReference>> {
  const attachmentURLsToAttachmentIDReferences: Map<
    string,
    AttachmentIDReference
  > = new Map();

  const promises: Promise<unknown>[] = [];
  for (const item of embeddedItems) {
    const urls = getAttachmentURLsInEmbeddedItem(item);
    promises.push(
      ...urls.map(async (url) => {
        try {
          const idReference = await fetchAttachment(url);
          attachmentURLsToAttachmentIDReferences.set(url, idReference);
        } catch (error) {
          console.error(error);
        }
      }),
    );
  }

  await Promise.all(promises);

  return attachmentURLsToAttachmentIDReferences;
}

// Resolve attachments (specified by URL) to their immutable IDs.
export async function resolveReviewItems(
  embeddedItems: EmbeddedItem[],
): Promise<ReviewItem[]> {
  const attachmentURLsToAttachmentIDReferences = await resolveAttachments(
    embeddedItems,
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
      console.error(`Skipping review item: error`);
    } else {
      reviewItems.push(reviewItem);
    }
  }
  return reviewItems;
}
