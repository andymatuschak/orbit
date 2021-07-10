import { TaskComponentState } from "./entities/task";
import { RepetitionOutcomeType } from "./event";

export interface Scheduler {
  applyRepetitionToComponentState(
    componentState: TaskComponentState,
    timestampMillis: number,
    outcome: RepetitionOutcomeType,
  ): TaskComponentState;
}
