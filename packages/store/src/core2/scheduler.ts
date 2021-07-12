import { TaskComponentState } from "./entities/task";
import { TaskRepetitionOutcome } from "./event";

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
