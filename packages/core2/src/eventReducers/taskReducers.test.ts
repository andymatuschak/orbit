import {
  ClozeTaskContent,
  MemoryTaskSpec,
  TaskContentType,
  TaskSpecType,
} from "../entities/task";
import { EntityID } from "../entity";
import {
  EventID,
  EventType,
  TaskIngestEvent,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
  TaskRescheduleEvent,
  TaskUpdateDeletedEvent,
} from "../event";
import { eventReducer } from "../eventReducer";

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

const testIngestEvent = {
  id: "x" as EventID,
  type: EventType.TaskIngest,
  entityID: "a" as EntityID,
  spec: testClozeSpec,
  timestampMillis: 100,
  provenance: null,
} as TaskIngestEvent;
const initialTask = eventReducer(null, testIngestEvent);

const firstComponentID = Object.keys(testClozeSpec.content.components)[0];

describe("ingest reducer", () => {
  test("ingests without a base state", () => {
    const task = eventReducer(null, testIngestEvent);
    expect(task.id).toBe(testIngestEvent.entityID);
    expect(task.isDeleted).toBe(false);
    expect(task.spec).toEqual(testClozeSpec);
    expect(task.componentStates).toMatchInlineSnapshot(`
      Object {
        "a": Object {
          "createdAtTimestampMillis": 100,
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
        "b": Object {
          "createdAtTimestampMillis": 100,
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
      }
    `);
  });

  test("no-op with a base state", () => {
    const initialTask = eventReducer(null, testIngestEvent);
    const modifiedTask = eventReducer(initialTask, {
      ...testIngestEvent,
      id: (testIngestEvent.id + "2") as EventID,
      timestampMillis: 1000,
    });
    expect(modifiedTask).toEqual(initialTask);
  });
});

describe("repetition reducer", () => {
  const testRepetitionEvent: TaskRepetitionEvent = {
    id: "y" as EventID,
    type: EventType.TaskRepetition,
    entityID: testIngestEvent.entityID,
    timestampMillis: 1000,
    outcome: TaskRepetitionOutcome.Remembered,
    componentID: firstComponentID,
    reviewSessionID: "testSession",
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testRepetitionEvent)).toThrow();
  });

  test.each([
    { outcome: TaskRepetitionOutcome.Remembered },
    { outcome: TaskRepetitionOutcome.Forgotten },
  ])("repetition: $outcome", ({ outcome }) => {
    const repetitionEvent: TaskRepetitionEvent = {
      ...testRepetitionEvent,
      timestampMillis:
        testIngestEvent.timestampMillis + 1000 * 60 * 60 * 24 * 14,
      outcome,
    };
    const task = eventReducer(initialTask, repetitionEvent);

    for (const [id, componentState] of Object.entries(task.componentStates)) {
      if (id === firstComponentID) {
        expect(componentState).not.toEqual(initialTask.componentStates[id]);
        expect(componentState.lastRepetitionTimestampMillis).toEqual(
          repetitionEvent.timestampMillis,
        );
      } else {
        expect(componentState).toEqual(initialTask.componentStates[id]);
      }
    }
  });
});

describe("reschedule reducer", () => {
  const testRescheduleEvent: TaskRescheduleEvent = {
    id: "y" as EventID,
    type: EventType.TaskReschedule,
    entityID: testIngestEvent.entityID,
    timestampMillis: 1000,
    componentID: firstComponentID,
    newDueTimestampMillis: 5000,
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testRescheduleEvent)).toThrow();
  });

  test("reschedules", () => {
    const task = eventReducer(initialTask, testRescheduleEvent);
    for (const [id, componentState] of Object.entries(task.componentStates)) {
      if (id === firstComponentID) {
        expect(componentState.dueTimestampMillis).toBe(
          testRescheduleEvent.newDueTimestampMillis,
        );
        expect(componentState.intervalMillis).toBe(
          initialTask.componentStates[id].intervalMillis,
        );
      } else {
        expect(componentState).toEqual(initialTask.componentStates[id]);
      }
    }
  });
});

describe("updateDeleted reducer", () => {
  const testEvent: TaskUpdateDeletedEvent = {
    id: "y" as EventID,
    type: EventType.TaskUpdateDeleted,
    entityID: testIngestEvent.entityID,
    timestampMillis: 1500,
    isDeleted: true,
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testEvent)).toThrow();
  });

  test("reschedules", () => {
    const task = eventReducer(initialTask, testEvent);
    expect(task.isDeleted).toBe(true);
  });
});
