import {
  AttachmentID,
  AttachmentIngestEvent,
  AttachmentMIMEType,
  AttachmentReference,
  ClozeTaskContent,
  EntityType,
  EventID,
  EventType,
  MemoryTaskSpec,
  Task,
  TaskContentType,
  TaskID,
  TaskIngestEvent,
  TaskSpecType,
} from "@withorbit/core2";

const testClozeSpec: MemoryTaskSpec<ClozeTaskContent> = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.Cloze,
    body: {
      text: "This is a test cloze prompt.",
      attachments: [],
    },
    components: {
      a: {
        ranges: [
          {
            startIndex: 5,
            endIndex: 10,
            hint: null,
          },
        ],
      },
      b: {
        ranges: [
          {
            startIndex: 2,
            endIndex: 4,
            hint: null,
          },
        ],
      },
    },
  },
};

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
}: {
  id: string;
  dueTimestampMillis: number;
}): Task {
  // lazy deep clone
  const newTask = JSON.parse(JSON.stringify(testTask)) as Task;
  newTask.id = id as TaskID;
  for (const componentID of Object.keys(newTask.componentStates)) {
    newTask.componentStates[componentID].dueTimestampMillis =
      dueTimestampMillis;
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

export function createTestTaskIngestEvents(
  count: number,
  prefix: string,
): TaskIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: `event_${prefix}_${i}` as EventID,
    type: EventType.TaskIngest,
    spec: testClozeSpec,
    entityID: `entity_${prefix}_${i}` as TaskID,
    timestampMillis: i * 5000 + 10000,
    provenance: null,
  }));
}

export function createTestAttachmentIngestEvents(
  count: number,
  prefix: string,
): AttachmentIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: `event_${prefix}_${i}` as EventID,
    type: EventType.AttachmentIngest,
    entityID: `entity_${prefix}_${i}` as AttachmentID,
    timestampMillis: i * 5000 + 10000,
    mimeType: AttachmentMIMEType.PNG,
  }));
}
