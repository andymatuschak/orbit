import {
  ActionLogID,
  applicationPromptType,
  ClozePromptParameters,
  clozePromptType,
  getClozeDeletionCount,
  getIDForActionLogSync,
  getIDForPromptSync,
  getIDForPromptTask,
  getNextTaskParameters,
  ingestActionLogType,
  Prompt,
  PromptActionLog,
  PromptProvenanceType,
  PromptTask,
  PromptTaskID,
  qaPromptType,
  repetitionActionLogType,
  WebPromptProvenance,
} from "metabook-core";
import { EmbeddedHostMetadata } from "metabook-embedded-support";
import { ReviewAreaMarkingRecord, ReviewItem } from "metabook-ui";
import getAttachmentURLsByIDInReviewItem from "./util/getAttachmentURLsByIDInReviewItem";

type PromptActionLogEntry = { log: PromptActionLog; id: ActionLogID };

export interface EmbeddedActionsRecord {
  logEntries: PromptActionLogEntry[];
  promptsByID: { [key: string]: Prompt };
  attachmentURLsByID: { [key: string]: string };
}

function createProvenance(
  hostMetadata: EmbeddedHostMetadata,
): WebPromptProvenance {
  return {
    provenanceType: PromptProvenanceType.Web,
    title: hostMetadata.title,
    url: hostMetadata.url,
    externalID: hostMetadata.url,
    modificationTimestampMillis: null,
    colorPaletteName: hostMetadata.colorPaletteName,
    siteName: hostMetadata.siteName,
  };
}

function createIngestLogEntry(
  provenance: WebPromptProvenance,
  taskID: PromptTaskID,
  timestampMillis: number,
): PromptActionLogEntry {
  const ingestLog: PromptActionLog = {
    actionLogType: ingestActionLogType,
    taskID,
    timestampMillis: timestampMillis,
    provenance,
  };
  return { log: ingestLog, id: getIDForActionLogSync(ingestLog) };
}

function createIngestLogEntries(
  hostMetadata: EmbeddedHostMetadata,
  reviewItem: ReviewItem,
  reviewedPromptTask: PromptTask,
  timestampMillis: number,
): {
  logEntries: PromptActionLogEntry[];
  reviewItemLogEntry: PromptActionLogEntry;
} {
  const logEntries: PromptActionLogEntry[] = [];
  const provenance = createProvenance(hostMetadata);
  const reviewItemLogEntry = createIngestLogEntry(
    provenance,
    getIDForPromptTask(reviewedPromptTask),
    timestampMillis,
  );
  logEntries.push(reviewItemLogEntry);

  switch (reviewItem.prompt.promptType) {
    case clozePromptType:
      // Also ingest tasks for all the other cloze deletions.
      for (
        let clozeIndex = 0;
        clozeIndex < getClozeDeletionCount(reviewItem.prompt);
        clozeIndex++
      ) {
        // Alas, TypeScript's refinements aren't quite deep enough to make this inference correctly.
        if (
          clozeIndex ===
          (reviewItem.promptParameters as ClozePromptParameters).clozeIndex
        ) {
          continue;
        }

        logEntries.push(
          createIngestLogEntry(
            provenance,
            getIDForPromptTask({
              promptType: clozePromptType,
              promptID: reviewedPromptTask.promptID,
              promptParameters: { clozeIndex },
            }),
            timestampMillis,
          ),
        );
      }
      break;
    case qaPromptType:
    case applicationPromptType:
      break;
  }
  return { logEntries, reviewItemLogEntry };
}

export function getActionsRecordForMarking(
  hostMetadata: EmbeddedHostMetadata,
  marking: ReviewAreaMarkingRecord,
  sessionStartTimestampMillis: number,
  markingTimestampMillis: number = Date.now(),
): EmbeddedActionsRecord {
  const promptTask = {
    promptType: marking.reviewItem.prompt.promptType,
    promptID: getIDForPromptSync(marking.reviewItem.prompt),
    promptParameters: marking.reviewItem.promptParameters,
  } as PromptTask;

  let repetitionParentActionLogIDs: ActionLogID[];
  let ingestLogEntries: PromptActionLogEntry[];
  if (marking.reviewItem.promptState) {
    ingestLogEntries = [];
    repetitionParentActionLogIDs =
      marking.reviewItem.promptState?.headActionLogIDs ?? [];
  } else {
    const { logEntries, reviewItemLogEntry } = createIngestLogEntries(
      hostMetadata,
      marking.reviewItem,
      promptTask,
      markingTimestampMillis,
    );
    ingestLogEntries = logEntries;
    repetitionParentActionLogIDs = [reviewItemLogEntry.id];
  }

  const repetitionLog: PromptActionLog = {
    actionLogType: repetitionActionLogType,
    taskID: getIDForPromptTask(promptTask),
    parentActionLogIDs: repetitionParentActionLogIDs,
    taskParameters: getNextTaskParameters(
      marking.reviewItem.prompt,
      marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
    ),
    outcome: marking.outcome,
    context: `embedded/${sessionStartTimestampMillis}`,
    timestampMillis: markingTimestampMillis,
  };
  const repetitionLogEntry = {
    log: repetitionLog,
    id: getIDForActionLogSync(repetitionLog),
  };

  return {
    logEntries: [...ingestLogEntries, repetitionLogEntry],
    promptsByID: { [promptTask.promptID]: marking.reviewItem.prompt },
    attachmentURLsByID: getAttachmentURLsByIDInReviewItem(
      marking.reviewItem.prompt,
      marking.reviewItem.attachmentResolutionMap,
    ),
  };
}

export function mergePendingActionsRecords(
  a: EmbeddedActionsRecord,
  b: EmbeddedActionsRecord,
): EmbeddedActionsRecord {
  return {
    logEntries: [...a.logEntries, ...b.logEntries],
    promptsByID: { ...a.promptsByID, ...b.promptsByID },
    attachmentURLsByID: { ...a.attachmentURLsByID, ...b.attachmentURLsByID },
  };
}
