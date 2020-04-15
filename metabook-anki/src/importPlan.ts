import fs from "fs";
import {
  ActionLog,
  applicationPromptType,
  Attachment,
  BasicPromptTaskParameters,
  basicPromptType,
  ClozePromptTaskParameters,
  clozePromptType,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  getIDForPrompt,
  getIDForPromptTask,
  imageAttachmentType,
  ingestActionLogType,
  Prompt,
  PromptActionLog,
  PromptParameters,
  PromptProvenanceType,
  PromptRepetitionActionLog,
  PromptRepetitionOutcome,
  PromptTask,
  PromptTaskID,
  repetitionActionLogType,
  AttachmentIDReference,
  getIDForAttachment,
  getAttachmentMimeTypeForFilename,
  NotePromptProvenance,
  PromptProvenance,
  applyActionLogToPromptState,
  PromptState,
} from "metabook-core";

import * as Anki from "./ankiPkg";
import { getModelMapping, ModelMapping } from "./modelMapping";
import { mapNoteToPrompt } from "./noteMapping";

interface ImportPlan {
  prompts: Prompt[];
  attachments: Attachment[];
  logs: ActionLog[];
  issues: string[];
}

export function createPlanForNote(
  note: Anki.Note,
  ankiCollection: Anki.Collection,
  attachmentNamesToAttachmentIDReferences: Map<string, AttachmentIDReference>,
  modelMappingCache: { [p: number]: ModelMapping },
): { prompt: Prompt; issues: string[] } | Error {
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

export function extractPromptTaskIDForCard(
  card: Anki.Card,
  prompt: Prompt,
): PromptTaskID {
  const promptID = getIDForPrompt(prompt);
  let promptParameters: PromptParameters;
  switch (prompt.promptType) {
    case basicPromptType:
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

export function createPlanForCard(
  card: Anki.Card,
  prompt: Prompt,
  noteProvenance: PromptProvenance | null,
): PromptActionLog<BasicPromptTaskParameters | ClozePromptTaskParameters> {
  // Generate an ingest log.
  return {
    actionLogType: ingestActionLogType,
    provenance: noteProvenance ?? {
      provenanceType: PromptProvenanceType.Anki,
      cardModificationTimestampMillis: card.mod * 1000,
      cardID: card.id,
    },
    taskID: extractPromptTaskIDForCard(card, prompt),
    timestampMillis: card.id,
  };
}

export function createPlanForLog<
  P extends BasicPromptTaskParameters | ClozePromptTaskParameters
>(
  ankiLog: Anki.Log,
  cardLastActionLog: PromptActionLog<P>,
): PromptRepetitionActionLog<P> {
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
      getIDForActionLog(getActionLogFromPromptActionLog(cardLastActionLog)),
    ],
    taskParameters: null,
    actionLogType: repetitionActionLogType,
  } as PromptRepetitionActionLog<P>;
}

async function readAttachmentAtPath(
  name: string,
  path: string,
): Promise<Attachment | Error> {
  const mimeType = getAttachmentMimeTypeForFilename(name);
  if (mimeType) {
    const contents = await fs.promises.readFile(path, { encoding: "binary" });
    return { type: imageAttachmentType, mimeType, contents };
  } else {
    return new Error(`Unsupported attachment type: ${name}`);
  }
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
              id: getIDForAttachment(Buffer.from(result.contents, "binary")),
            });
          }
        },
      ),
    );
  }

  await Anki.readNotes(handle, (note) => {
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
      noteIDsToProvenance.set(note.id, provenance);
    }
  });

  const cardIDsToPromptStates: Map<number, PromptState> = new Map();

  const cardIDsToLastActionLogs: Map<
    number,
    PromptActionLog<BasicPromptTaskParameters | ClozePromptTaskParameters>
  > = new Map();
  await Anki.readCards(handle, (card) => {
    // Only ingest cards whose notes are included.
    const prompt = noteIDsToPrompts.get(card.nid);
    if (!prompt) {
      return;
    }

    const promptActionLog = createPlanForCard(
      card,
      prompt,
      noteIDsToProvenance.get(card.nid) ?? null,
    );
    plan.logs.push(getActionLogFromPromptActionLog(promptActionLog));
    cardIDsToLastActionLogs.set(card.id, promptActionLog);

    cardIDsToPromptStates.set(
      card.id,
      applyActionLogToPromptState({
        promptActionLog,
        schedule: "default",
        basePromptState: null,
      }) as PromptState,
    );
  });

  await Anki.readLogs(handle, (ankiLog) => {
    const cardLastActionLog = cardIDsToLastActionLogs.get(ankiLog.cid);
    if (!cardLastActionLog) {
      return;
    }

    const promptActionLog = createPlanForLog(ankiLog, cardLastActionLog);
    plan.logs.push(promptActionLog);

    const newPromptState = applyActionLogToPromptState({
      promptActionLog,
      schedule: "default",
      basePromptState: cardIDsToPromptStates.get(ankiLog.cid)!,
    }) as PromptState;
    cardIDsToPromptStates.set(ankiLog.cid, newPromptState);

    const oneDay = 1000 * 60 * 60 * 24;
    (promptActionLog as any).debug = {
      newInterval: newPromptState.intervalMillis / oneDay,
      originalInterval: ankiLog.ivl < 0 ? ankiLog.ivl / -oneDay : ankiLog.ivl,
    };

    cardIDsToLastActionLogs.set(ankiLog.cid, promptActionLog);
  });

  return plan;
}
