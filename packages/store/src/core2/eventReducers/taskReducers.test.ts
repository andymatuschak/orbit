import { testTask } from "../../database/__tests__/testTasks";
import { EntityID } from "../entity";
import { EventID, EventType, TaskIngestEvent } from "../event";
import { taskIngestEventReducer } from "./taskReducers";

describe("ingest reducer", () => {
  const testIngestEvent = {
    id: "x" as EventID,
    type: EventType.TaskIngest,
    entityID: "a" as EntityID,
    spec: testTask.spec,
    timestampMillis: 100,
    provenance: null,
  } as TaskIngestEvent;

  test("without a base state", () => {
    const task = taskIngestEventReducer(null, testIngestEvent);
    expect(task.id).toBe(testIngestEvent.entityID);
    expect(task.isDeleted).toBe(false);
    expect(task.spec).toEqual(testTask.spec);
    expect(task.componentStates).toMatchInlineSnapshot(`
      Object {
        "a": Object {
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
        "b": Object {
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
      }
    `);
  });

  test("with a base state", () => {
    const initialTask = taskIngestEventReducer(null, testIngestEvent);
    const modifiedTask = taskIngestEventReducer(initialTask, {
      ...testIngestEvent,
      timestampMillis: 1000,
    });
    expect(modifiedTask).toEqual(initialTask);
  });
});

test("repetition reducer", () => {
  // TODO
});
