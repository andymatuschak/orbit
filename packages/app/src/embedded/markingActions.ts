import {
  AttachmentID,
  EventForEntity,
  EventType,
  generateUniqueID,
  ReviewItem,
  Task,
  TaskContent,
  TaskContentType,
  TaskProvenance,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import { EmbeddedHostMetadata } from "@withorbit/embedded-support";

export interface EmbeddedActionsRecord {
  events: EventForEntity<Task>[];
  ingestedAttachmentEntries: { id: AttachmentID; url: string }[];
}

function createProvenance(hostMetadata: EmbeddedHostMetadata): TaskProvenance {
  return {
    identifier: hostMetadata.url,
    url: hostMetadata.url,
    ...(hostMetadata.title && { title: hostMetadata.title }),
    ...(hostMetadata.siteName && { containerTitle: hostMetadata.siteName }),
    ...(hostMetadata.colorPaletteName && {
      colorPaletteName: hostMetadata.colorPaletteName,
    }),
  };
}

export function getActionsRecordForMarking({
  outcome,
  reviewItem,
  hostMetadata,
  sessionStartTimestampMillis,
  getURLForAttachmentID,
  markingTimestampMillis = Date.now(),
}: {
  outcome: TaskRepetitionOutcome;
  reviewItem: ReviewItem;
  hostMetadata: EmbeddedHostMetadata;
  sessionStartTimestampMillis: number;
  getURLForAttachmentID: (id: AttachmentID) => string | null;
  markingTimestampMillis?: number;
}): EmbeddedActionsRecord {
  if (outcome === TaskRepetitionOutcome.Skipped) {
    return { events: [], ingestedAttachmentEntries: [] };
  }

  const attachmentIDs = getAttachmentsInTaskContent(
    reviewItem.task.spec.content,
  );
  // HACK: We don't emit AttachmentIngestEvent attachments here, because we don't know their MIME types. Instead, /attachments/ingestFromURLs will store those events after it stores the corresponding attachments.

  return {
    events: [
      /*
       We emit task ingest events even when emitting markings for retry events to avoid a potential race condition in this case:
       1. User completes a review area, forgetting at least one prompt, but doesn't sign in.
       2. User retries forgotten prompt in subsequent review area.
       3. User signs in.
       4. Events from review area #2 arrive at server before those of #1. (now we have a repetition before an ingest: no good)
       */
      {
        type: EventType.TaskIngest,
        id: generateUniqueID(),
        entityID: reviewItem.task.id,
        timestampMillis: markingTimestampMillis,
        provenance: createProvenance(hostMetadata),
        spec: reviewItem.task.spec,
      },
      {
        type: EventType.TaskRepetition,
        id: generateUniqueID(),
        entityID: reviewItem.task.id,
        timestampMillis: markingTimestampMillis,
        componentID: reviewItem.componentID,
        outcome,
        reviewSessionID: `embedded/${sessionStartTimestampMillis}`,
      },
    ],
    ingestedAttachmentEntries: attachmentIDs.map((id) => {
      const url = getURLForAttachmentID(id);
      if (!url) {
        throw new Error(`Inconsistent: no URL for attachemnt ${id}`);
      }
      return { id, url };
    }),
  };
}

export function mergePendingActionsRecords(
  a: EmbeddedActionsRecord,
  b: EmbeddedActionsRecord,
): EmbeddedActionsRecord {
  return {
    events: [...a.events, ...b.events],
    ingestedAttachmentEntries: [
      ...a.ingestedAttachmentEntries,
      ...b.ingestedAttachmentEntries,
    ],
  };
}

function getAttachmentsInTaskContent(content: TaskContent): AttachmentID[] {
  switch (content.type) {
    case TaskContentType.QA:
      return [...content.body.attachments, ...content.answer.attachments];
    case TaskContentType.Plain:
    case TaskContentType.Cloze:
      return content.body.attachments;
  }
}
