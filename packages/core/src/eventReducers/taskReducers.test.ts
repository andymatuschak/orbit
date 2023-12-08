import {
  testClozeSpec,
  testClozeTask,
  testIngestClozeTaskEvent,
} from "../__tests__/testTasks.js";
import {
  EventID,
  EventType,
  TaskRepetitionEvent,
  TaskRepetitionOutcome,
  TaskRescheduleEvent,
  TaskUpdateDeletedEvent,
  TaskUpdateMetadataEvent,
  TaskUpdateProvenanceEvent,
  TaskUpdateSpecEvent,
} from "../event.js";
import { eventReducer } from "../eventReducer.js";

const testTaskFirstComponentID = Object.keys(
  testClozeSpec.content.components,
)[0];

describe("ingest reducer", () => {
  test("ingests without a base state", () => {
    const task = eventReducer(null, testIngestClozeTaskEvent);
    expect(task.id).toBe(testIngestClozeTaskEvent.entityID);
    expect(task.isDeleted).toBe(false);
    expect(task.spec).toEqual(testClozeSpec);
    expect(task.componentStates).toMatchInlineSnapshot(`
      {
        "a": {
          "createdAtTimestampMillis": 100,
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
        "b": {
          "createdAtTimestampMillis": 100,
          "dueTimestampMillis": 100,
          "intervalMillis": 0,
          "lastRepetitionTimestampMillis": null,
        },
      }
    `);
  });

  test("no-op with a base state", () => {
    const initialTask = eventReducer(null, testIngestClozeTaskEvent);
    const modifiedTask = eventReducer(initialTask, {
      ...testIngestClozeTaskEvent,
      id: (testIngestClozeTaskEvent.id + "2") as EventID,
      timestampMillis: 1000,
    });
    expect(modifiedTask).toEqual(initialTask);
  });

  test("no-op with a deleted base state", () => {
    const initialTask = eventReducer(null, testIngestClozeTaskEvent);
    initialTask.isDeleted = true;
    const modifiedTask = eventReducer(initialTask, {
      ...testIngestClozeTaskEvent,
      id: (testIngestClozeTaskEvent.id + "2") as EventID,
      timestampMillis: 1000,
    });
    expect(modifiedTask.isDeleted).toBe(false);
  });
});

describe("repetition reducer", () => {
  const testRepetitionEvent: TaskRepetitionEvent = {
    id: "y" as EventID,
    type: EventType.TaskRepetition,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1000,
    outcome: TaskRepetitionOutcome.Remembered,
    componentID: testTaskFirstComponentID,
    reviewSessionID: "testSession",
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testRepetitionEvent)).toThrow();
  });

  test.each([
    { outcome: TaskRepetitionOutcome.Remembered },
    { outcome: TaskRepetitionOutcome.Forgotten },
    { outcome: TaskRepetitionOutcome.Skipped },
  ])("repetition: $outcome", ({ outcome }) => {
    const repetitionEvent: TaskRepetitionEvent = {
      ...testRepetitionEvent,
      timestampMillis:
        testIngestClozeTaskEvent.timestampMillis + 1000 * 60 * 60 * 24 * 14,
      outcome,
    };
    const task = eventReducer(testClozeTask, repetitionEvent);

    for (const [id, componentState] of Object.entries(task.componentStates)) {
      if (id === testTaskFirstComponentID) {
        expect(componentState).not.toEqual(testClozeTask.componentStates[id]);
        expect(componentState.lastRepetitionTimestampMillis).toEqual(
          repetitionEvent.timestampMillis,
        );
      } else {
        expect(componentState).toEqual(testClozeTask.componentStates[id]);
      }
    }
  });
});

describe("reschedule reducer", () => {
  const testRescheduleEvent: TaskRescheduleEvent = {
    id: "y" as EventID,
    type: EventType.TaskReschedule,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1000,
    componentID: testTaskFirstComponentID,
    newDueTimestampMillis: 5000,
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testRescheduleEvent)).toThrow();
  });

  test("reschedules", () => {
    const task = eventReducer(testClozeTask, testRescheduleEvent);
    for (const [id, componentState] of Object.entries(task.componentStates)) {
      if (id === testTaskFirstComponentID) {
        expect(componentState.dueTimestampMillis).toBe(
          testRescheduleEvent.newDueTimestampMillis,
        );
        expect(componentState.intervalMillis).toBe(
          testClozeTask.componentStates[id].intervalMillis,
        );
      } else {
        expect(componentState).toEqual(testClozeTask.componentStates[id]);
      }
    }
  });
});

describe("updateDeleted reducer", () => {
  const testEvent: TaskUpdateDeletedEvent = {
    id: "y" as EventID,
    type: EventType.TaskUpdateDeleted,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1500,
    isDeleted: true,
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testEvent)).toThrow();
  });

  test("reschedules", () => {
    const task = eventReducer(testClozeTask, testEvent);
    expect(task.isDeleted).toBe(true);
  });
});

describe("updateSpec reducer", () => {
  const testEvent: TaskUpdateSpecEvent = {
    id: "y" as EventID,
    type: EventType.TaskUpdateSpecEvent,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1500,
    spec: {
      ...testClozeSpec,
      content: {
        ...testClozeSpec.content,
        body: {
          ...testClozeSpec.content.body,
          text: "This is a test cloze prompt - updated.",
        },
      },
    },
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testEvent)).toThrow();
  });

  test("updates provenance", () => {
    const task = eventReducer(testClozeTask, testEvent);
    expect(task.spec).toEqual(testEvent.spec);
  });
});

describe("updateProvenance reducer", () => {
  const testEvent: TaskUpdateProvenanceEvent = {
    id: "y" as EventID,
    type: EventType.TaskUpdateProvenanceEvent,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1500,
    provenance: {
      identifier: "source ID",
      colorPaletteName: "orange",
    },
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testEvent)).toThrow();
  });

  test("updates provenance", () => {
    const task = eventReducer(testClozeTask, testEvent);
    expect(task.provenance).toEqual(testEvent.provenance);
  });
});

describe("updateMetadata reducer", () => {
  const testEvent: TaskUpdateMetadataEvent = {
    id: "y" as EventID,
    type: EventType.TaskUpdateMetadataEvent,
    entityID: testIngestClozeTaskEvent.entityID,
    timestampMillis: 1500,
    metadata: {
      a: "a",
      b: "b",
    },
  };

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testEvent)).toThrow();
  });

  test("updates from empty", () => {
    const task = eventReducer(testClozeTask, testEvent);
    expect(task.metadata).toEqual(testEvent.metadata);
  });

  test("merges", () => {
    const secondUpdateEvent: TaskUpdateMetadataEvent = {
      id: "z" as EventID,
      type: EventType.TaskUpdateMetadataEvent,
      entityID: testIngestClozeTaskEvent.entityID,
      timestampMillis: 1501,
      metadata: {
        b: "b'",
        c: "c",
      },
    };
    const task1 = eventReducer(testClozeTask, testEvent);
    const task2 = eventReducer(task1, secondUpdateEvent);
    expect(task2.metadata).toEqual({ a: "a", b: "b'", c: "c" });
  });
});
