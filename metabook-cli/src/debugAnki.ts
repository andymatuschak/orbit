import {
  ActionLog,
  applyActionLogToPromptState,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  ingestActionLogType,
  PromptState,
  PromptTaskID,
  repetitionActionLogType,
} from "metabook-core";
import fs from "fs";
import plan from "./importPlan.json";

function formatMillis(millis: number): string {
  let working = millis;
  if (millis < 1000) {
    return `${millis}ms`;
  }
  working /= 1000;
  if (working < 60) {
    return `${working}s`;
  }
  working /= 60;
  if (working < 60) {
    return `${working}m`;
  }
  working /= 60;
  if (working < 24) {
    return `${working}h`;
  }
  working /= 24;
  return `${working}d`;
}

(async () => {
  const promptStates = new Map<PromptTaskID, PromptState>();
  const logs: { [key: string]: ActionLog } = {};

  const taskIDsToInspect: Set<PromptTaskID> = new Set();
  for (const log of plan.logs) {
    const promptState = applyActionLogToPromptState({
      promptActionLog: getPromptActionLogFromActionLog(log),
      schedule: "default",
      basePromptState: promptStates.get(log.taskID) ?? null,
    }) as PromptState;
    if (
      log.actionLogType === repetitionActionLogType &&
      (log as any).debug.newInterval > 50 &&
      (log as any).debug.originalInterval < 2
    ) {
      taskIDsToInspect.add(log.taskID);
    }
    logs[getIDForActionLog(log)] = log;
    promptStates.set(log.taskID, promptState);
  }

  const intervalCounts = new Map<number, number>();
  let printed = false;
  for (const [taskID, promptState] of promptStates.entries()) {
    if (promptState.dueTimestampMillis <= Date.now()) {
      intervalCounts.set(
        promptState.intervalMillis,
        (intervalCounts.get(promptState.intervalMillis) ?? 0) + 1,
      );
    }
    if (taskIDsToInspect.has(taskID) && !printed) {
      const queue = [];
      let head: ActionLog | null = logs[promptState.headActionLogIDs[0]];
      while (head) {
        queue.unshift(head);
        if (head.actionLogType === ingestActionLogType) {
          head = null;
        } else {
          head = logs[head.parentActionLogIDs[0]];
        }
      }

      let basePromptState: PromptState | null = null;
      console.log(promptState.provenance!);
      for (const q of queue) {
        const newPromptState = applyActionLogToPromptState({
          schedule: "default",
          basePromptState,
          promptActionLog: getPromptActionLogFromActionLog(q),
        }) as PromptState;
        if (basePromptState) {
          console.log(
            `Interval: ${formatMillis(
              q.timestampMillis - basePromptState.lastReviewTimestampMillis,
            )}. Scheduled interval: ${formatMillis(
              basePromptState.intervalMillis,
            )}`,
          );
        }
        console.log(q, newPromptState);
        basePromptState = newPromptState;
      }
      printed = true;
    }
  }

  const csv: string[] = ["Old,New"];
  for (const log of plan.logs) {
    const anyLog = log as any;
    if ("debug" in anyLog) {
      csv.push(`${anyLog.debug.originalInterval},${anyLog.debug.newInterval}`);
    }
  }
  await fs.promises.writeFile("comparison.csv", csv.join("\n"));

  let total = 0;
  for (const [interval, count] of [...intervalCounts.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    console.log(`${formatMillis(interval)}\t\t${count}`);
    total += count;
  }

  console.log("Total scheduled: ", total);
})();
