import * as dateFns from "date-fns";
import { PromptState } from "metabook-core";

export function generateDuePromptStates(
  baseTimestampMillis: number,
  count: number,
  dueInDays: number,
  intervalDays: number,
): PromptState[] {
  return Array.from(new Array(count).keys()).map(
    () =>
      ({
        intervalMillis: intervalDays * 1000 * 60 * 60 * 24,
        dueTimestampMillis: dateFns
          .addDays(baseTimestampMillis, dueInDays)
          .valueOf(),
      } as PromptState),
  );
}
