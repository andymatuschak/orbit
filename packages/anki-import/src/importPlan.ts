import {
  AttachmentID,
  AttachmentIngestEvent,
  AttachmentMIMEType,
  Event,
  EventType,
  generateUniqueID,
  getAttachmentMIMETypeForFilename,
  mainTaskComponentID,
  TaskContentType,
  TaskID,
  TaskIngestEvent,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
  TaskRescheduleEvent,
  TaskSpec,
} from "@withorbit/core";
import fs from "fs";
import * as Anki from "./ankiPkg/index.js";
import { Card, CardQueue, Collection } from "./ankiPkg/index.js";
import { convertAnkiID } from "./convertAnkiID.js";
import { getModelMapping, ModelMapping } from "./modelMapping.js";
import { mapNoteToTaskSpec } from "./noteMapping.js";

interface ImportPlan {
  events: Event[];
  attachments: Attachment[];
  issues: string[];
}

interface Attachment {
  contents: Uint8Array;
  mimeType: AttachmentMIMEType;
  id: AttachmentID;
}

export function createSpecForNote(
  note: Anki.Note,
  ankiCollection: Anki.Collection,
  modelMappingCache: { [p: number]: ModelMapping },
):
  | {
      spec: TaskSpec;
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

  return mapNoteToTaskSpec(note, modelMapping);
}

export async function createPlanForLog(
  ankiLog: Anki.Log,
  taskID: TaskID,
  componentID: string,
): Promise<TaskRepetitionEvent> {
  let outcome: TaskRepetitionOutcome;
  switch (ankiLog.type) {
    case Anki.ReviewLogType.Learn:
    case Anki.ReviewLogType.Relearn:
      outcome =
        ankiLog.ease === Anki.LearnEaseRating.Again
          ? TaskRepetitionOutcome.Forgotten
          : TaskRepetitionOutcome.Remembered;
      break;
    case Anki.ReviewLogType.Cram:
    case Anki.ReviewLogType.Review:
      outcome =
        ankiLog.ease === Anki.ReviewEaseRating.Again
          ? TaskRepetitionOutcome.Forgotten
          : TaskRepetitionOutcome.Remembered;
      break;
  }

  return {
    type: EventType.TaskRepetition,
    id: generateUniqueID(),
    entityID: taskID,
    outcome,
    timestampMillis: ankiLog.id,
    reviewSessionID: "anki",
    componentID,
  };
}

async function readAttachmentAtPath(
  name: string,
  path: string,
): Promise<Attachment | Error> {
  const mimeType = getAttachmentMIMETypeForFilename(name);
  if (mimeType) {
    const contents = await fs.promises.readFile(path);
    return { mimeType, contents, id: convertAnkiID(name) };
  } else {
    return new Error(`Unsupported attachment type: ${name}`);
  }
}

export function createRescheduleEventForCard(
  card: Card,
  collection: Collection,
  taskID: TaskID,
  componentID: string,
): TaskRescheduleEvent | null {
  let newDueTimestampMillis: number | null;
  switch (card.queue) {
    case CardQueue.UserBuried:
    case CardQueue.Buried:
    case CardQueue.Suspended:
    case CardQueue.New:
      return null;
    case CardQueue.Learning:
      // card.due is seconds since epoch
      newDueTimestampMillis = card.due * 1000;
      break;
    case CardQueue.Due:
    case CardQueue.LearningNotDue:
      // card.due is days since collection's creation
      newDueTimestampMillis =
        collection.crt * 1000 + card.due * 1000 * 60 * 60 * 24;
      break;
  }
  return {
    type: EventType.TaskReschedule,
    timestampMillis: Date.now(),
    id: generateUniqueID(),
    newDueTimestampMillis,
    entityID: taskID,
    componentID,
  };
}

export function getComponentID(
  card: Card,
  contentType: TaskContentType,
): string | null {
  switch (contentType) {
    case TaskContentType.Plain:
    case TaskContentType.QA:
      if (card.ord === 0) {
        return mainTaskComponentID;
      } else {
        return null;
      }
    case TaskContentType.Cloze:
      // TODO: This mapping is only correct for "simple" cloze deletions (i.e. with only one range)
      return card.ord.toString();
  }
}

export async function createImportPlan(
  handle: Anki.AnkiCollectionDBHandle,
  mediaManifest: Anki.MediaManifest | null,
  attachmentIDsToExtractedPaths: { [key: string]: string },
): Promise<ImportPlan> {
  const plan: ImportPlan = {
    events: [],
    attachments: [],
    issues: [],
  };

  const collection = await Anki.readCollection(handle);
  const modelMappingCache: { [key: number]: ModelMapping } = {};
  const noteIDsToTaskSpecs = new Map<number, TaskSpec>();

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
            const attachmentIngestEvent: AttachmentIngestEvent = {
              type: EventType.AttachmentIngest,
              id: generateUniqueID(),
              entityID: result.id,
              mimeType: result.mimeType,
              timestampMillis: Date.now(),
            };
            plan.events.push(attachmentIngestEvent);
            plan.attachments.push(result);
          }
        },
      ),
    );
  }

  await Anki.readNotes(handle, async (note) => {
    const result = createSpecForNote(note, collection, modelMappingCache);
    if (result instanceof Error) {
      plan.issues.push(result.message);
    } else {
      const { spec, issues } = result;
      plan.issues.push(...issues);
      noteIDsToTaskSpecs.set(note.id, spec);
    }
  });

  const cardIDsToCards: Map<number, Card> = new Map();
  const noteIDsToCards: Map<number, Card[]> = new Map();
  await Anki.readCards(handle, async (card) => {
    cardIDsToCards.set(card.id, card);

    const priorNoteCards = noteIDsToCards.get(card.nid);
    noteIDsToCards.set(
      card.nid,
      priorNoteCards ? [...priorNoteCards, card] : [card],
    );
  });

  const noteIDsToTaskIDs = new Map<number, TaskID>();

  function addIngestEventForNoteID(
    noteID: number,
    taskSpec: TaskSpec,
    timestampMillis: number,
  ): TaskIngestEvent {
    const cards = noteIDsToCards.get(noteID);
    if (!cards) throw new Error(`Inconsistent: note ${noteID} has no cards`);

    const metadata: { [key: string]: string } = {};
    for (const card of cards) {
      const componentID = getComponentID(card, taskSpec.content.type);
      if (componentID) {
        metadata[`ankiCardID_${componentID}`] = card.id.toString();
      }
    }

    const ingestEvent: TaskIngestEvent = {
      type: EventType.TaskIngest,
      id: generateUniqueID(),
      entityID: generateUniqueID(),
      spec: taskSpec,
      provenance: {
        // TODO: perhaps migrate Anki deck metainfo here
        identifier: `ankiNoteID_${noteID}`,
      },
      timestampMillis,
      metadata,
    };
    plan.events.push(ingestEvent);
    return ingestEvent;
  }

  await Anki.readLogs(handle, async (ankiLog) => {
    const card = cardIDsToCards.get(ankiLog.cid);
    if (!card) {
      throw new Error(
        `Inconsistent: log ${ankiLog.id} references missing card with ID ${ankiLog.cid}`,
      );
    }
    const spec = noteIDsToTaskSpecs.get(card.nid);
    if (!spec) return;

    const componentID = getComponentID(card, spec.content.type);
    if (componentID === null) return;

    let taskID = noteIDsToTaskIDs.get(card.nid);
    if (taskID === undefined) {
      const event = addIngestEventForNoteID(card.nid, spec, ankiLog.id);
      taskID = event.entityID;
      noteIDsToTaskIDs.set(card.nid, taskID);
    }

    const repetitionEvent = await createPlanForLog(
      ankiLog,
      taskID,
      componentID,
    );
    plan.events.push(repetitionEvent);
  });

  const stragglerNoteIDs = new Set<number>();
  await Anki.readCards(handle, async (card) => {
    const spec = noteIDsToTaskSpecs.get(card.nid);
    if (!spec) return;

    // If this card belongs to a note that was never reviewed, and we've already add an ingest event in this last pass, skip it.
    if (stragglerNoteIDs.has(card.nid)) return;

    const taskID = noteIDsToTaskIDs.get(card.nid);
    if (taskID === undefined) {
      // This note has never actually been reviewed.
      addIngestEventForNoteID(card.nid, spec, card.id);
      stragglerNoteIDs.add(card.nid);
    } else {
      const componentID = getComponentID(card, spec.content.type);
      if (componentID) {
        const rescheduleEvent = await createRescheduleEventForCard(
          card,
          collection,
          taskID,
          componentID,
        );
        if (rescheduleEvent) {
          plan.events.push(rescheduleEvent);
        }
      }
    }
  });

  return plan;
}
