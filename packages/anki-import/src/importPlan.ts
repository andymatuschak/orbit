import fs from "fs";
import {
  ActionLog,
  applicationPromptType,
  applyActionLogToPromptState,
  Attachment,
  AttachmentIDReference,
  qaPromptType,
  clozePromptType,
  getActionLogFromPromptActionLog,
  getAttachmentMimeTypeForFilename,
  getIDForActionLog,
  getIDForAttachment,
  getIDForPrompt,
  getIDForPromptTask,
  getPromptActionLogFromActionLog,
  imageAttachmentType,
  ingestActionLogType,
  NotePromptProvenance,
  Prompt,
  PromptActionLog,
  PromptParameters,
  PromptProvenance,
  PromptProvenanceType,
  PromptRepetitionActionLog,
  PromptRepetitionOutcome,
  PromptState,
  PromptTask,
  PromptTaskID,
  repetitionActionLogType,
  rescheduleActionLogType,
  ClozePromptTask,
  QAPromptTask,
} from "@withorbit/core";
import * as Anki from "./ankiPkg";
import { Card, CardQueue, Collection } from "./ankiPkg";
import { getModelMapping, ModelMapping } from "./modelMapping";
import { mapNoteToPrompt } from "./noteMapping";

interface ImportPlan {
  prompts: Prompt[];
  attachments: Attachment[];
  logs: ActionLog[];
  issues: string[];
  promptStateCaches: { taskID: string; promptState: PromptState }[];
}

export function createPlanForNote(
  note: Anki.Note,
  ankiCollection: Anki.Collection,
  attachmentNamesToAttachmentIDReferences: Map<string, AttachmentIDReference>,
  modelMappingCache: { [p: number]: ModelMapping },
):
  | {
      prompt: Prompt;
      provenance: NotePromptProvenance | null;
      issues: string[];
    }
  | Error {
  const modelID = note.mid;
  let modelMapping: ModelMapping = modelMappingCache[modelID];
  if (!modelMapping) {
    const tentativeModelMapping = getModelMapping(ankiCollection, modelID);
    if (tentativeModelMapping === "unknown") {
      return new Error(
        `Note ${note.id} references model of unknown type with ID ${modelID}`,
      );
    } else if (tentativeModelMapping === "missing") {
      return new Error(
        `Note ${note.id} references missing model with ID ${modelID}`,
      );
    }
    modelMapping = tentativeModelMapping;
    modelMappingCache[modelID] = tentativeModelMapping;
  }

  return mapNoteToPrompt(note, modelMapping, (reference) => {
    return attachmentNamesToAttachmentIDReferences.get(reference.name) ?? null;
  });
}

export async function extractPromptTaskIDForCard(
  card: Anki.Card,
  prompt: Prompt,
): Promise<PromptTaskID> {
  const promptID = await getIDForPrompt(prompt);
  let promptParameters: PromptParameters;
  switch (prompt.promptType) {
    case qaPromptType:
    case applicationPromptType:
      promptParameters = null;
      break;
    case clozePromptType:
      promptParameters = { clozeIndex: card.ord };
      break;
  }
  return getIDForPromptTask({
    promptType: prompt.promptType,
    promptID,
    promptParameters,
  } as PromptTask);
}

export async function createPlanForCard(
  card: Anki.Card,
  prompt: Prompt,
  noteProvenance: PromptProvenance | null,
  overrideTimestampMillis?: number,
): Promise<PromptActionLog<QAPromptTask | ClozePromptTask>> {
  // Generate an ingest log.
  return {
    actionLogType: ingestActionLogType,
    provenance: noteProvenance ?? {
      provenanceType: PromptProvenanceType.Anki,
      modificationTimestampMillis: card.mod * 1000,
      externalID: card.id.toString(),
      url: null,
      title: null,
    },
    taskID: await extractPromptTaskIDForCard(card, prompt),
    timestampMillis: overrideTimestampMillis ?? card.id,
  };
}

export async function createPlanForLog<
  PT extends QAPromptTask | ClozePromptTask,
>(
  ankiLog: Anki.Log,
  cardLastActionLog: PromptActionLog<PT>,
): Promise<PromptRepetitionActionLog<PT>> {
  let outcome: PromptRepetitionOutcome;
  switch (ankiLog.type) {
    case Anki.ReviewLogType.Learn:
    case Anki.ReviewLogType.Relearn:
      outcome =
        ankiLog.ease === Anki.LearnEaseRating.Again
          ? PromptRepetitionOutcome.Forgotten
          : PromptRepetitionOutcome.Remembered;
      break;
    case Anki.ReviewLogType.Cram:
    case Anki.ReviewLogType.Review:
      outcome =
        ankiLog.ease === Anki.ReviewEaseRating.Again
          ? PromptRepetitionOutcome.Forgotten
          : PromptRepetitionOutcome.Remembered;
      break;
  }

  return {
    timestampMillis: ankiLog.id,
    context: null,
    taskID: cardLastActionLog.taskID,
    outcome,
    parentActionLogIDs: [
      await getIDForActionLog(
        getActionLogFromPromptActionLog(cardLastActionLog),
      ),
    ],
    taskParameters: null,
    actionLogType: repetitionActionLogType,
  } as PromptRepetitionActionLog<PT>;
}

async function readAttachmentAtPath(
  name: string,
  path: string,
): Promise<Attachment | Error> {
  const mimeType = getAttachmentMimeTypeForFilename(name);
  if (mimeType) {
    const contents = await fs.promises.readFile(path);
    return { type: imageAttachmentType, mimeType, contents };
  } else {
    return new Error(`Unsupported attachment type: ${name}`);
  }
}

export async function createRescheduleLogForCard(
  card: Card,
  collection: Collection,
  lastActionLog: PromptActionLog<QAPromptTask | ClozePromptTask>,
): Promise<ActionLog | null> {
  let newTimestampMillis: number | null;
  switch (card.queue) {
    case CardQueue.UserBuried:
    case CardQueue.Buried:
    case CardQueue.Suspended:
    case CardQueue.New:
      return null;
    case CardQueue.Learning:
      // card.due is seconds since epoch
      newTimestampMillis = card.due * 1000;
      break;
    case CardQueue.Due:
    case CardQueue.LearningNotDue:
      // card.due is days since collection's creation
      newTimestampMillis =
        collection.crt * 1000 + card.due * 1000 * 60 * 60 * 24;
      break;
  }
  return {
    actionLogType: rescheduleActionLogType,
    parentActionLogIDs: [
      await getIDForActionLog(getActionLogFromPromptActionLog(lastActionLog)),
    ],
    timestampMillis: Date.now(),
    newTimestampMillis,
    taskID: lastActionLog.taskID,
  };
}

export async function createImportPlan(
  handle: Anki.AnkiCollectionDBHandle,
  mediaManifest: Anki.MediaManifest | null,
  attachmentIDsToExtractedPaths: { [key: string]: string },
): Promise<ImportPlan> {
  const plan: ImportPlan = {
    prompts: [],
    attachments: [],
    logs: [],
    issues: [],
    promptStateCaches: [],
  };

  const collection = await Anki.readCollection(handle);
  const modelMappingCache: { [key: number]: ModelMapping } = {};
  const noteIDsToPrompts: Map<number, Prompt> = new Map();
  const noteIDsToProvenance: Map<number, NotePromptProvenance> = new Map();

  const attachmentNamesToAttachmentIDReferences: Map<
    string,
    AttachmentIDReference
  > = new Map();
  if (mediaManifest) {
    await Promise.all(
      Object.entries(mediaManifest).map(
        async ([ankiAttachmentID, attachmentName]) => {
          const attachmentPath =
            attachmentIDsToExtractedPaths[ankiAttachmentID];
          const result = await readAttachmentAtPath(
            attachmentName,
            attachmentPath,
          );
          if (result instanceof Error) {
            plan.issues.push(result.message);
          } else {
            plan.attachments.push(result);
            attachmentNamesToAttachmentIDReferences.set(attachmentName, {
              type: result.type,
              byteLength: result.contents.length,
              id: await getIDForAttachment(result.contents),
            });
          }
        },
      ),
    );
  }

  await Anki.readNotes(handle, async (note) => {
    const result = createPlanForNote(
      note,
      collection,
      attachmentNamesToAttachmentIDReferences,
      modelMappingCache,
    );
    if (result instanceof Error) {
      plan.issues.push(result.message);
    } else {
      const { prompt, issues, provenance } = result;
      plan.prompts.push(prompt);
      plan.issues.push(...issues);
      noteIDsToPrompts.set(note.id, prompt);
      if (provenance) {
        noteIDsToProvenance.set(note.id, provenance);
      }
    }
  });

  const cardIDsToCards: Map<number, Card> = new Map();
  const cardIDsToIngest: Set<number> = new Set();
  await Anki.readCards(handle, async (card) => {
    cardIDsToCards.set(card.id, card);
    cardIDsToIngest.add(card.id);
  });

  const taskIDsToPromptStates: Map<string, PromptState> = new Map();
  const cardIDsToLastActionLogs: Map<
    number,
    PromptActionLog<QAPromptTask | ClozePromptTask>
  > = new Map();

  async function addIngestEventForCardID(
    cardID: number,
    overrideTimestampMillis?: number,
  ): Promise<PromptActionLog<QAPromptTask | ClozePromptTask> | null> {
    // Create the ingest log for this card.
    const card = cardIDsToCards.get(cardID);
    if (!card) {
      return null;
    }
    const prompt = noteIDsToPrompts.get(card.nid);
    if (!prompt) {
      // Only ingest cards whose notes are included.
      return null;
    }
    const promptActionLog = await createPlanForCard(
      card,
      prompt,
      noteIDsToProvenance.get(card.nid) ?? null,
      overrideTimestampMillis,
    );
    plan.logs.push(getActionLogFromPromptActionLog(promptActionLog));

    taskIDsToPromptStates.set(
      promptActionLog.taskID,
      applyActionLogToPromptState({
        promptActionLog,
        actionLogID: await getIDForActionLog(
          getActionLogFromPromptActionLog(promptActionLog),
        ),
        schedule: "default",
        basePromptState: null,
      }) as PromptState,
    );

    return promptActionLog;
  }

  await Anki.readLogs(handle, async (ankiLog) => {
    let cardLastActionLog = cardIDsToLastActionLogs.get(ankiLog.cid);
    if (!cardLastActionLog) {
      const maybeLog = await addIngestEventForCardID(ankiLog.cid, ankiLog.id);
      if (maybeLog) {
        cardLastActionLog = maybeLog;
        cardIDsToIngest.delete(ankiLog.cid);
      } else {
        return;
      }
    }

    const promptActionLog = await createPlanForLog(ankiLog, cardLastActionLog);
    plan.logs.push(getActionLogFromPromptActionLog(promptActionLog));

    const newPromptState = applyActionLogToPromptState({
      promptActionLog,
      actionLogID: await getIDForActionLog(
        getActionLogFromPromptActionLog(promptActionLog),
      ),
      schedule: "default",
      basePromptState: taskIDsToPromptStates.get(promptActionLog.taskID)!,
    }) as PromptState;
    taskIDsToPromptStates.set(promptActionLog.taskID, newPromptState);

    cardIDsToLastActionLogs.set(ankiLog.cid, promptActionLog);
  });

  let reschedulelessCards = 0;
  await Anki.readCards(handle, async (card) => {
    if (cardIDsToIngest.has(card.id)) {
      // These cards have never actually been reviewed.
      await addIngestEventForCardID(card.id);
    } else {
      const cardLastActionLog = cardIDsToLastActionLogs.get(card.id);
      if (!cardLastActionLog) {
        throw new Error(`Inconsistent database. ${card.id} generated no logs`);
      }
      const rescheduleLog = await createRescheduleLogForCard(
        card,
        collection,
        cardLastActionLog,
      );
      if (rescheduleLog) {
        plan.logs.push(rescheduleLog);
        const newPromptState = applyActionLogToPromptState({
          promptActionLog: getPromptActionLogFromActionLog(rescheduleLog),
          actionLogID: await getIDForActionLog(rescheduleLog),
          schedule: "default",
          basePromptState: taskIDsToPromptStates.get(rescheduleLog.taskID)!,
        }) as PromptState;
        taskIDsToPromptStates.set(rescheduleLog.taskID, newPromptState);
      } else {
        reschedulelessCards++;
      }
    }
  });
  console.log("cards without reschedule", reschedulelessCards);

  plan.promptStateCaches = [...taskIDsToPromptStates.entries()].map(
    ([taskID, promptState]) => {
      return { taskID, promptState };
    },
  );

  return plan;
}
