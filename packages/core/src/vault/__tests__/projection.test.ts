import { describe, expect, test } from "bun:test";
import {
  TaskContentType,
  TaskRepetitionOutcome,
  TaskSpecType,
  type Task,
  type TaskID,
  type TaskSpec,
} from "../../index.js";
import {
  EventType,
  type Event,
  type EventID,
} from "../../__tests__/legacy/event.js";
import { eventReducer } from "../../__tests__/legacy/eventReducer.js";
import type { ObservationID, VaultID } from "../ids.js";
import type { OrbitVault, VaultTask } from "../schema.js";
import { projectVault } from "../projection/projectVault.js";

describe("vault projection", () => {
  test("matches the legacy reducer over deterministic random valid histories", () => {
    for (let seed = 1; seed <= 100; seed++) {
      const events = randomHistory(seed);
      let legacyTask: Task | null = null;
      for (const event of events) {
        legacyTask = eventReducer(legacyTask, event) as Task;
      }
      const vault = vaultFromLegacyHistory(events, legacyTask!);
      const projected = projectVault({
        document: vault,
      }).tasks.get(taskID);
      expect(projected).toEqual(legacyTask);
    }
  });

  test("a retroactive correction and deletion rebuild fold order", () => {
    const vault = baseVault();
    vault.tasks[taskID] = taskDefinition(1_000);
    vault.observations[observationID("later")] = review(3_000);
    vault.observations[observationID("earlier")] = review(2_000);
    expect(
      projectVault({ document: vault }).tasks.get(taskID)?.componentStates.main
        .lastRepetitionTimestampMillis,
    ).toBe(3_000);

    vault.observations[observationID("later")] = review(1_500);
    expect(
      projectVault({ document: vault }).tasks.get(taskID)?.componentStates.main
        .lastRepetitionTimestampMillis,
    ).toBe(2_000);

    delete vault.observations[observationID("earlier")];
    expect(
      projectVault({ document: vault }).tasks.get(taskID)?.componentStates.main
        .lastRepetitionTimestampMillis,
    ).toBe(1_500);
  });

  test("reports observations whose component no longer exists", () => {
    const vault = baseVault();
    vault.tasks[taskID] = taskDefinition(1_000);
    vault.observations[observationID("review")] = {
      ...review(2_000),
      componentID: "absent",
    };
    const projection = projectVault({
      document: vault,
    });
    expect(projection.issues).toEqual([
      {
        kind: "unknown-component",
        observationID: observationID("review"),
        taskID,
        componentID: "absent",
      },
    ]);
    expect(
      projection.tasks.get(taskID)?.componentStates.main
        .lastRepetitionTimestampMillis,
    ).toBeNull();
  });

  test("unsupported schedulers are rejected", () => {
    const fsrsVault = {
      ...baseVault(),
      scheduler: {
        kind: "fsrs",
        version: 1,
      },
    } as unknown as OrbitVault;
    expect(() => projectVault({ document: fsrsVault })).toThrow(
      "Unsupported scheduler",
    );
  });
});

const taskID = "task-projection-test" as TaskID;

function baseVault(): OrbitVault {
  return {
    vaultID: "vault-projection-test" as VaultID,
    createdAtTimestampMillis: 1_000,
    scheduler: {
      kind: "orbit-sm2-like",
      version: 1,
      intervalGrowthFactor: 2.3,
      initialReviewIntervalMillis: 5 * 24 * 60 * 60 * 1_000,
    },
    tasks: {},
    observations: {},
    attachments: {},
  };
}

function taskDefinition(createdAtTimestampMillis: number): VaultTask {
  return {
    createdAtTimestampMillis,
    spec: plainSpec("Prompt"),
    provenance: null,
    metadata: {},
    isDeleted: false,
  };
}

function plainSpec(text: string): TaskSpec {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Plain,
      body: { text, attachments: [] },
    },
  };
}

function review(occurredAtTimestampMillis: number) {
  return {
    kind: "review" as const,
    taskID,
    componentID: "main",
    occurredAtTimestampMillis,
    reviewSessionID: "session",
    outcome: TaskRepetitionOutcome.Remembered,
  };
}

function observationID(value: string): ObservationID {
  return value as ObservationID;
}

function randomHistory(seed: number): Event[] {
  let randomState = seed >>> 0;
  const next = () => {
    randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
    return randomState;
  };
  const events: Event[] = [
    {
      id: eventID(seed, 0),
      entityID: taskID,
      type: EventType.TaskIngest,
      timestampMillis: 1_000,
      spec: plainSpec(`Initial ${seed}`),
      provenance: null,
      metadata: {},
    },
  ];
  for (let index = 1; index <= 40; index++) {
    const timestampMillis = 1_000 + index * 100;
    const id = eventID(seed, index);
    switch (next() % 7) {
      case 0:
      case 1:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskRepetition,
          timestampMillis,
          componentID: "main",
          reviewSessionID: `session-${seed}`,
          outcome: [
            TaskRepetitionOutcome.Remembered,
            TaskRepetitionOutcome.Forgotten,
            TaskRepetitionOutcome.Skipped,
          ][next() % 3],
        });
        break;
      case 2:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskReschedule,
          timestampMillis,
          componentID: "main",
          newDueTimestampMillis: timestampMillis + (next() % 50_000),
        });
        break;
      case 3:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskUpdateDeleted,
          timestampMillis,
          isDeleted: next() % 2 === 0,
        });
        break;
      case 4:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskUpdateMetadataEvent,
          timestampMillis,
          metadata: { [`key-${next() % 4}`]: `value-${next() % 10}` },
        });
        break;
      case 5:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskUpdateSpecEvent,
          timestampMillis,
          spec: plainSpec(`Edited ${next()}`),
        });
        break;
      default:
        events.push({
          id,
          entityID: taskID,
          type: EventType.TaskIngest,
          timestampMillis,
          spec: plainSpec(`Ignored ${next()}`),
          provenance: null,
          metadata: { reingested: String(next() % 10) },
        });
    }
  }
  return events;
}

function vaultFromLegacyHistory(events: Event[], task: Task): OrbitVault {
  const vault = baseVault();
  vault.tasks[task.id] = {
    createdAtTimestampMillis: task.createdAtTimestampMillis,
    spec: task.spec,
    provenance: task.provenance,
    metadata: task.metadata,
    isDeleted: task.isDeleted,
  };
  for (const event of events) {
    if (event.type === EventType.TaskRepetition) {
      vault.observations[event.id as unknown as ObservationID] = {
        kind: "review",
        taskID: event.entityID,
        componentID: event.componentID,
        occurredAtTimestampMillis: event.timestampMillis,
        reviewSessionID: event.reviewSessionID,
        outcome: event.outcome,
      };
    } else if (event.type === EventType.TaskReschedule) {
      vault.observations[event.id as unknown as ObservationID] = {
        kind: "reschedule",
        taskID: event.entityID,
        componentID: event.componentID,
        occurredAtTimestampMillis: event.timestampMillis,
        newDueTimestampMillis: event.newDueTimestampMillis,
      };
    }
  }
  return vault;
}

function eventID(seed: number, index: number): EventID {
  return `event-${seed.toString().padStart(3, "0")}-${index
    .toString()
    .padStart(3, "0")}` as EventID;
}
