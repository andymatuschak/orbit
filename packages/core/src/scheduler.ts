import { TaskComponentState } from "./entities/task.js";
import { TaskRepetitionOutcome } from "./event.js";

export interface Scheduler {
  computeNextDueIntervalMillisForRepetition(
    componentState: TaskComponentState,
    timestampMillis: number,
    outcome: TaskRepetitionOutcome,
  ): SchedulerOutput;
}

export type SchedulerOutput = {
  dueTimestampMillis: number;
  intervalMillis: number;
};
