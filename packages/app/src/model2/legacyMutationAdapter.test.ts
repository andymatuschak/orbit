import {
  EventType,
  TaskRepetitionOutcome,
  type EventID,
  type ObservationID,
  type TaskID,
  type VaultMutationID,
} from "@withorbit/core";
import { describe, expect, test } from "bun:test";
import { legacyEventsForMutations } from "./legacyMutationAdapter.js";

const stableID = "0123456789ABCDEFGHIJKL";
const taskID = "task-legacy-adapter" as TaskID;

describe("legacy mutation adapter", () => {
  test("maps a typed review to the legacy event boundary", () => {
    expect(
      legacyEventsForMutations([
        {
          kind: "recordReview",
          mutationID: `review/${stableID}` as VaultMutationID,
          observationID: `review/${stableID}` as ObservationID,
          taskID,
          componentID: "main",
          reviewSessionID: "session",
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 1_234,
        },
      ]),
    ).toEqual([
      {
        type: EventType.TaskRepetition,
        id: stableID as EventID,
        entityID: taskID,
        componentID: "main",
        reviewSessionID: "session",
        outcome: TaskRepetitionOutcome.Remembered,
        timestampMillis: 1_234,
      },
    ]);
  });

  test("accepts namespaced delete IDs without leaking that namespace", () => {
    expect(
      legacyEventsForMutations(
        [
          {
            kind: "setTaskDeleted",
            mutationID: `task-delete/${stableID}` as VaultMutationID,
            taskID,
            isDeleted: true,
          },
        ],
        5_678,
      ),
    ).toEqual([
      {
        type: EventType.TaskUpdateDeleted,
        id: stableID as EventID,
        entityID: taskID,
        timestampMillis: 5_678,
        isDeleted: true,
      },
    ]);
  });

  test("rejects a review whose mutation and observation IDs diverge", () => {
    expect(() =>
      legacyEventsForMutations([
        {
          kind: "recordReview",
          mutationID: `review/${stableID}` as VaultMutationID,
          observationID: "review/abcdefghijklmnopqrstuv" as ObservationID,
          taskID,
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 1_234,
        },
      ]),
    ).toThrow("mutation and observation IDs do not match");
  });
});
