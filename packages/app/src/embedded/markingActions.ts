import {
  AttachmentID,
  EventForEntity,
  EventType,
  generateUniqueID,
  Task,
  TaskContent,
  TaskContentType,
  TaskIngestEvent,
  TaskProvenance,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
} from "@withorbit/core2";
import { EmbeddedHostMetadata, ReviewItem } from "@withorbit/embedded-support";

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
  const attachmentIDs = getAttachmentsInTaskContent(
    reviewItem.task.spec.content,
  );
  // HACK: We don't emit ingest events for these attachments here, because we don't know their MIME types. Instead, /attachments/ingestFromURLs will store those events after it stores the corresponding attachments.

  const isFirstReview =
    reviewItem.task.componentStates[reviewItem.componentID]
      .lastRepetitionTimestampMillis === null;
  const ingestEvent: TaskIngestEvent | null = isFirstReview
    ? {
        type: EventType.TaskIngest,
        id: generateUniqueID(),
        entityID: reviewItem.task.id,
        timestampMillis: markingTimestampMillis,
        provenance: createProvenance(hostMetadata),
        spec: reviewItem.task.spec,
      }
    : null;

  const repetitionEvent: TaskRepetitionEvent = {
    type: EventType.TaskRepetition,
    id: generateUniqueID(),
    entityID: reviewItem.task.id,
    timestampMillis: markingTimestampMillis,
    componentID: reviewItem.componentID,
    outcome,
    reviewSessionID: `embedded/${sessionStartTimestampMillis}`,
  };

  return {
    events: ingestEvent ? [ingestEvent, repetitionEvent] : [repetitionEvent],
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
