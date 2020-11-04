import typedKeys from "../util/typedKeys";

export enum PromptRepetitionOutcome {
  Forgotten = "forgotten",
  Remembered = "remembered",
}
export type ReviewIntervalMilliseconds = number;

// Deliberately naive here. This is fine for now.
const minutes: ReviewIntervalMilliseconds = 1000 * 60;
const days: ReviewIntervalMilliseconds = minutes * 60 * 24;

export type MetabookSpacedRepetitionSchedule = "default" | "aggressiveStart";

export type IntervalEntry = { interval: number; label: string };

const _aggressiveStartIntervalSequence: IntervalEntry[] = [
  { interval: 0, label: "In-text" },
  { interval: 5 * days, label: "5d" },
  { interval: 11.5 * days, label: "2wk" },
  { interval: 26.45 * days, label: "1mo" },
  { interval: 60.835 * days, label: "2mo" },
  { interval: 139.9205 * days, label: "4mo" },
  { interval: 321.81715 * days, label: "1yr" },
];

const schedulesToIntervalSequences: Record<
  MetabookSpacedRepetitionSchedule,
  IntervalEntry[]
> = {
  default: _aggressiveStartIntervalSequence,
  aggressiveStart: _aggressiveStartIntervalSequence,
};

export function getIntervalSequenceForSchedule(
  schedule: MetabookSpacedRepetitionSchedule,
): IntervalEntry[] {
  return schedulesToIntervalSequences[schedule];
}

export function getInitialIntervalForSchedule(
  schedule: MetabookSpacedRepetitionSchedule,
) {
  return schedulesToIntervalSequences[schedule][1].interval;
}

const schedulesToIntervalsToLevels = ((): Record<
  MetabookSpacedRepetitionSchedule,
  { [key: number]: number }
> => {
  const cache: Partial<Record<
    MetabookSpacedRepetitionSchedule,
    { [key: number]: number }
  >> = {};
  typedKeys(schedulesToIntervalSequences).forEach((schedule) => {
    const lookupCache: { [key: number]: number } = {};
    schedulesToIntervalSequences[schedule].forEach(
      ({ interval }, index) => (lookupCache[interval] = index),
    );

    // Weird hack that I probably need to think through more... cards start with a 0 interval, since they're due for review right away. But later, if you forget something, and you get bumped down a level, we want the minimum interval to be something a bit higher than 0, like 10 minutes.
    lookupCache[0] = 0;

    cache[schedule] = lookupCache;
  });
  return cache as Record<
    MetabookSpacedRepetitionSchedule,
    { [key: number]: number }
  >;
})();

export const getLevelForInterval = (
  interval: ReviewIntervalMilliseconds,
  schedule: MetabookSpacedRepetitionSchedule,
): number => {
  const intervalSequence = schedulesToIntervalSequences[schedule];
  const level = schedulesToIntervalsToLevels[schedule][interval];
  if (level !== undefined) {
    return level;
  } else {
    // Find the largest level whose interval is less than the interval we were given.
    const closeLevel = intervalSequence.reduce(
      (
        largestSmallerIntervalIndex: number | null,
        { interval: currentInterval },
        index,
      ) => {
        if (interval >= currentInterval * 0.9) {
          if (
            largestSmallerIntervalIndex === null ||
            intervalSequence[largestSmallerIntervalIndex].interval <
              currentInterval
          ) {
            return index;
          }
        }
        return largestSmallerIntervalIndex;
      },
      null,
    );
    if (closeLevel === null) {
      return intervalSequence.length - 1;
    }
    return closeLevel;
  }
};
