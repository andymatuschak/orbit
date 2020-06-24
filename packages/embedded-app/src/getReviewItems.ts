import {
  AttachmentIDReference,
  AttachmentMimeType,
  AttachmentType,
  getAttachmentMimeTypeForFilename,
  getAttachmentTypeForAttachmentMimeType,
  getFileExtensionForAttachmentMimeType,
  getIDForAttachment,
} from "metabook-core";
import { AttachmentResolutionMap, ReviewItem } from "metabook-ui";
import {
  EmbeddedItem,
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";

function getAttachmentType(
  contentType: string | null,
  url: string,
): AttachmentType | null {
  const attachmentExtension =
    contentType && getFileExtensionForAttachmentMimeType(contentType);
  if (attachmentExtension) {
    return getAttachmentTypeForAttachmentMimeType(
      contentType as AttachmentMimeType,
    );
  } else {
    const attachmentMimeTypeFromExtension = getAttachmentMimeTypeForFilename(
      url,
    );
    if (attachmentMimeTypeFromExtension) {
      return getAttachmentTypeForAttachmentMimeType(
        attachmentMimeTypeFromExtension,
      );
    } else {
      return null;
    }
  }
}

async function fetchAttachment(url: string): Promise<AttachmentIDReference> {
  const response = await fetch(url);
  const responseIsOK = response.status >= 200 && response.status < 300;
  if (!responseIsOK) {
    throw new Error(
      `Error retrieving attachment at ${url}: ${response.status}`,
    );
  }

  const contentType = response.headers.get("Content-Type");
  const attachmentType = getAttachmentType(contentType, url);
  if (!attachmentType) {
    throw new Error(
      `Attachment at ${url} has unsupported content type ${contentType} and unsupported extension`,
    );
  }

  const attachmentData = await response.arrayBuffer();
  const attachmentID = await getIDForAttachment(new Uint8Array(attachmentData));

  return {
    id: attachmentID,
    byteLength: attachmentData.byteLength,
    type: attachmentType,
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
export async function getReviewItems(
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
    const reviewItem = getReviewItemFromEmbeddedItem(
      item,
      attachmentURLsToAttachmentIDReferences,
      attachmentResolutionMap,
    );

    if (reviewItem instanceof Error) {
      console.error(`Skipping review item: error`);
    } else {
      reviewItems.push(reviewItem);
    }
  }
  return reviewItems;
}
