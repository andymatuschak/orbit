import {
  AttachmentID,
  AttachmentIngestEvent,
  AttachmentMIMEType,
  AttachmentReference,
  EntityType,
  EventType,
  generateUniqueID,
  Task,
  TaskID,
  TaskIngestEvent,
} from "@withorbit/core";
import { testClozeSpec } from "./testClozeSpec.js";

export const testTask: Task = {
  id: "a" as TaskID,
  type: EntityType.Task,
  spec: testClozeSpec,
  createdAtTimestampMillis: 1000,
  provenance: null,
  componentStates: {
    a: {
      createdAtTimestampMillis: 1000,
      lastRepetitionTimestampMillis: null,
      dueTimestampMillis: 100,
      intervalMillis: 1000,
    },
    b: {
      createdAtTimestampMillis: 1000,
      lastRepetitionTimestampMillis: null,
      dueTimestampMillis: 200,
      intervalMillis: 2000,
    },
  },
  isDeleted: false,
  metadata: {},
};

export function createTestTask({
  id,
  dueTimestampMillis,
  intervalMillis = 1000,
}: {
  id: string;
  dueTimestampMillis: number;
  intervalMillis?: number;
}): Task {
  // lazy deep clone
  const newTask = JSON.parse(JSON.stringify(testTask)) as Task;
  newTask.id = id as TaskID;
  for (const componentID of Object.keys(newTask.componentStates)) {
    newTask.componentStates[componentID].dueTimestampMillis =
      dueTimestampMillis;
    newTask.componentStates[componentID].intervalMillis = intervalMillis;
  }
  return newTask;
}

export function createTestAttachmentReference(id: string): AttachmentReference {
  return {
    id: id as AttachmentID,
    createdAtTimestampMillis: 1000,
    type: EntityType.AttachmentReference,
    mimeType: AttachmentMIMEType.PNG,
  };
}

export function createTestTaskIngestEvents(count: number): TaskIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: generateUniqueID(),
    type: EventType.TaskIngest,
    spec: testClozeSpec,
    entityID: generateUniqueID(),
    timestampMillis: i * 5000 + 10000,
    provenance: null,
  }));
}

export function createTestAttachmentIngestEvents(
  count: number,
): AttachmentIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: generateUniqueID(),
    type: EventType.AttachmentIngest,
    entityID: generateUniqueID(),
    timestampMillis: i * 5000 + 10000,
    mimeType: AttachmentMIMEType.PNG,
  }));
}
