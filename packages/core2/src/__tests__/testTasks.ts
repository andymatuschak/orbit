import {
  ClozeTaskContent,
  MemoryTaskSpec,
  TaskContentType,
  TaskSpecType,
} from "../entities/task";
import { EntityID } from "../entity";
import { EventID, EventType, TaskIngestEvent } from "../event";
import { eventReducer } from "../eventReducer";

export const testClozeSpec: MemoryTaskSpec<ClozeTaskContent> = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.Cloze,
    body: {
      text: "This is a test cloze prompt.",
      attachments: [],
    },
    components: {
      a: {
        order: 0,
        ranges: [
          {
            startIndex: 5,
            length: 5,
            hint: null,
          },
        ],
      },
      b: {
        order: 1,
        ranges: [
          {
            startIndex: 2,
            length: 2,
            hint: null,
          },
        ],
      },
    },
  },
};

export const testIngestClozeTaskEvent = {
  id: "x" as EventID,
  type: EventType.TaskIngest,
  entityID: "a" as EntityID,
  spec: testClozeSpec,
  timestampMillis: 100,
  provenance: null,
} as TaskIngestEvent;

export const testClozeTask = eventReducer(null, testIngestClozeTaskEvent);
