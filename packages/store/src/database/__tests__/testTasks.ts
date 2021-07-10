import { AttachmentMimeType } from "@withorbit/core";
import {
  AttachmentID,
  AttachmentReference,
  ClozeTaskContent,
  EntityType,
  EventID,
  MemoryTaskSpec,
  Task,
  TaskContentType,
  TaskID,
  TaskSpecType,
} from "../../core2";
import { DatabaseBackendEntityRecord } from "../backend";

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
  provenance: null,
  componentStates: {
    a: {
      lastRepetitionTimestampMillis: null,
      dueTimestampMillis: 100,
      intervalMillis: 1000,
    },
    b: {
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
  lastEventID,
  lastEventTimestampMillis,
  dueTimestampMillis,
}: {
  id: string;
  lastEventID: string;
  lastEventTimestampMillis: number;
  dueTimestampMillis: number;
}): DatabaseBackendEntityRecord<Task> {
  // lazy deep clone
  const newTask = JSON.parse(JSON.stringify(testTask)) as Task;
  newTask.id = id as TaskID;
  newTask.componentStates["a"].dueTimestampMillis = dueTimestampMillis;
  return {
    entity: newTask,
    lastEventID: lastEventID as EventID,
    lastEventTimestampMillis,
  };
}

export const testTasks: DatabaseBackendEntityRecord<Task>[] = [
  createTestTask({
    id: "a",
    lastEventID: "x",
    lastEventTimestampMillis: 5,
    dueTimestampMillis: 50,
  }),
  createTestTask({
    id: "b",
    lastEventID: "y",
    lastEventTimestampMillis: 4,
    dueTimestampMillis: 100,
  }),
  createTestTask({
    id: "c",
    lastEventID: "z",
    lastEventTimestampMillis: 3,
    dueTimestampMillis: 150,
  }),
];

export function createTestAttachmentReference(
  id: string,
  lastEventID: string,
): DatabaseBackendEntityRecord<AttachmentReference> {
  return {
    lastEventID: lastEventID as EventID,
    lastEventTimestampMillis: 1000,
    entity: {
      id: id as AttachmentID,
      type: EntityType.AttachmentReference,
      mimeType: AttachmentMimeType.PNG,
    },
  };
}

export const testAttachmentReferences: DatabaseBackendEntityRecord<AttachmentReference>[] =
  [
    createTestAttachmentReference("a_a", "x"),
    createTestAttachmentReference("a_b", "y"),
  ];
