import {
  ActionLogID,
  applicationPromptType,
  ClozePromptParameters,
  clozePromptType,
  getClozeDeletionCount,
  getIDForActionLogSync,
  getIDForPromptTask,
  getPromptTaskForID,
  ingestActionLogType,
  Prompt,
  PromptActionLog,
  PromptID,
  PromptProvenanceType,
  PromptTaskID,
  qaPromptType,
  repetitionActionLogType,
  WebPromptProvenance,
} from "metabook-core";
import { EmbeddedHostMetadata, ReviewItem } from "metabook-embedded-support";
import { ReviewAreaMarkingRecord } from "metabook-ui";

type PromptActionLogEntry = { log: PromptActionLog; id: ActionLogID };

export interface EmbeddedActionsRecord {
  logEntries: PromptActionLogEntry[];
  promptsByID: { [key: string]: Prompt };
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
  reviewedPromptID: PromptID,
  timestampMillis: number,
): {
  logEntries: PromptActionLogEntry[];
  reviewItemLogEntry: PromptActionLogEntry;
} {
  const logEntries: PromptActionLogEntry[] = [];
  const provenance = createProvenance(hostMetadata);
  const reviewItemLogEntry = createIngestLogEntry(
    provenance,
    reviewItem.promptTaskID,
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
              promptID: reviewedPromptID,
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

export function getActionsRecordForMarking({
  markingRecord,
  reviewItem,
  hostMetadata,
  sessionStartTimestampMillis,
  markingTimestampMillis = Date.now(),
}: {
  markingRecord: ReviewAreaMarkingRecord;
  reviewItem: ReviewItem;
  hostMetadata: EmbeddedHostMetadata;
  sessionStartTimestampMillis: number;
  markingTimestampMillis?: number;
}): EmbeddedActionsRecord {
  const promptTask = getPromptTaskForID(reviewItem.promptTaskID);
  if (promptTask instanceof Error) {
    throw promptTask;
  }
  const promptID = promptTask.promptID;

  let repetitionParentActionLogIDs: ActionLogID[];
  let ingestLogEntries: PromptActionLogEntry[];
  if (reviewItem.promptState) {
    ingestLogEntries = [];
    repetitionParentActionLogIDs =
      reviewItem.promptState.headActionLogIDs ?? [];
  } else {
    const { logEntries, reviewItemLogEntry } = createIngestLogEntries(
      hostMetadata,
      reviewItem,
      promptID,
      markingTimestampMillis,
    );
    ingestLogEntries = logEntries;
    repetitionParentActionLogIDs = [reviewItemLogEntry.id];
  }

  const repetitionLog: PromptActionLog = {
    actionLogType: repetitionActionLogType,
    taskID: reviewItem.promptTaskID,
    parentActionLogIDs: repetitionParentActionLogIDs,
    taskParameters: markingRecord.reviewAreaItem.taskParameters,
    outcome: markingRecord.outcome,
    context: `embedded/${sessionStartTimestampMillis}`,
    timestampMillis: markingTimestampMillis,
  };
  const repetitionLogEntry = {
    log: repetitionLog,
    id: getIDForActionLogSync(repetitionLog),
  };

  return {
    logEntries: [...ingestLogEntries, repetitionLogEntry],
    promptsByID: { [promptID]: reviewItem.prompt },
  };
}

export function mergePendingActionsRecords(
  a: EmbeddedActionsRecord,
  b: EmbeddedActionsRecord,
): EmbeddedActionsRecord {
  return {
    logEntries: [...a.logEntries, ...b.logEntries],
    promptsByID: { ...a.promptsByID, ...b.promptsByID },
  };
}
