import { testTask } from "../../database/__tests__/testTasks";
import { EntityID } from "../entity";
import {
  EventID,
  EventType,
  RepetitionOutcomeType,
  TaskIngestEvent,
  TaskRepetitionEvent,
} from "../event";
import { eventReducer } from "../eventReducer";

const testIngestEvent = {
  id: "x" as EventID,
  type: EventType.TaskIngest,
  entityID: "a" as EntityID,
  spec: testTask.spec,
  timestampMillis: 100,
  provenance: null,
} as TaskIngestEvent;

describe("ingest reducer", () => {
  test("ingests without a base state", () => {
    const task = eventReducer(null, testIngestEvent);
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
  const firstComponentID = Object.keys(
    testIngestEvent.spec.content.components!,
  )[0];
  const testRepetitionEvent: TaskRepetitionEvent = {
    id: "y" as EventID,
    type: EventType.TaskRepetition,
    entityID: testIngestEvent.entityID,
    timestampMillis: 1000,
    outcome: RepetitionOutcomeType.Remembered,
    componentID: firstComponentID,
    reviewSessionID: "testSession",
  };

  const initialTask = eventReducer(null, testIngestEvent);
  const twoWeekInterval = 1000 * 60 * 60 * 24 * 14;

  test("fails without a base state", () => {
    expect(() => eventReducer(null, testRepetitionEvent)).toThrow();
  });

  describe("first repetition", () => {
    test("remembered", () => {
      const repetitionEvent: TaskRepetitionEvent = {
        ...testRepetitionEvent,
        timestampMillis: testIngestEvent.timestampMillis + twoWeekInterval,
        outcome: RepetitionOutcomeType.Remembered,
      };
      const task = eventReducer(initialTask, repetitionEvent);

      for (const [id, componentState] of Object.entries(task.componentStates)) {
        if (id === firstComponentID) continue;
        expect(componentState).toEqual(initialTask.componentStates[id]);
      }
      const reviewedComponentState = task.componentStates[firstComponentID];

      const nominalDueTimestamp =
        repetitionEvent.timestampMillis + reviewedComponentState.intervalMillis;
      // But there's jitter, so the actual due timestamp will be off by up to a few minutes.
      expect(
        reviewedComponentState.dueTimestampMillis - nominalDueTimestamp,
      ).toMatchInlineSnapshot(`60000`);

      const intervalGrowth =
        reviewedComponentState.intervalMillis /
        (repetitionEvent.timestampMillis -
          initialTask.componentStates[firstComponentID].dueTimestampMillis);
      expect(intervalGrowth).toMatchInlineSnapshot(`2.3`);
    });

    test("forgotten", () => {
      const repetitionEvent: TaskRepetitionEvent = {
        ...testRepetitionEvent,
        timestampMillis: testIngestEvent.timestampMillis + twoWeekInterval,
        outcome: RepetitionOutcomeType.Forgotten,
      };

      const task = eventReducer(initialTask, repetitionEvent);
      for (const [id, componentState] of Object.entries(task.componentStates)) {
        if (id === firstComponentID) continue;
        expect(componentState).toEqual(initialTask.componentStates[id]);
      }
      const reviewedComponentState = task.componentStates[firstComponentID];

      expect(reviewedComponentState.intervalMillis).toBe(0);

      // It should now be due again in a few minutes.
      expect(
        reviewedComponentState.dueTimestampMillis -
          repetitionEvent.timestampMillis,
      ).toMatchInlineSnapshot(`660000`);
    });
  });
});
