import {
  ClozeTaskContent,
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

export const testTask = {
  id: "a" as TaskID,
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
  dueTimestampMillis,
}: {
  id: string;
  lastEventID: string;
  dueTimestampMillis: number;
}): DatabaseBackendEntityRecord<Task> {
  // lazy deep clone
  const newTask = JSON.parse(JSON.stringify(testTask)) as Task;
  newTask.id = id as TaskID;
  newTask.componentStates["a"].dueTimestampMillis = dueTimestampMillis;
  return { entity: newTask, lastEventID: lastEventID as EventID };
}

export const testTasks: DatabaseBackendEntityRecord<Task>[] = [
  createTestTask({ id: "a", lastEventID: "x", dueTimestampMillis: 50 }),
  createTestTask({ id: "b", lastEventID: "y", dueTimestampMillis: 100 }),
  createTestTask({ id: "c", lastEventID: "z", dueTimestampMillis: 150 }),
];
