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

/*
const intervalForContinuousLevel = (
  level: number,
  schedule: MetabookSpacedRepetitionSchedule,
): number => {
  const intervalSequence = schedulesToIntervalSequences[schedule];

  // exp(0) = 1
  // exp(a) = level_ceil_interval - level_floor_interval
  // a = ln(level_ceil_interval - level_floor_interval)
  if (level >= intervalSequence.length - 1) {
    return intervalSequence[intervalSequence.length - 1].interval;
  }

  const baseLevel = Math.floor(level);
  const nextLevel = Math.floor(level + 1);
  const highInterval = intervalSequence[nextLevel].interval;
  const lowInterval = intervalSequence[baseLevel].interval;
  // exp(x - h) + k...
  const h = Math.log(
    (Math.exp(nextLevel) - Math.exp(baseLevel)) / (highInterval - lowInterval),
  );
  const k = lowInterval - Math.exp(baseLevel - h);
  return Math.exp(level - h) + k;
};

export const getAverageLevel = (
  intervals: number[],
  schedule: MetabookSpacedRepetitionSchedule,
) => {
  if (intervals.length === 0) {
    return 0;
  } else {
    return (
      intervals.reduce(
        (acc, interval) => acc + getLevelForInterval(interval, schedule),
        0,
      ) / intervals.length
    );
  }
};

// Used in the copy in the review completion screen.
export const getLogAverageInterval = (
  intervals: number[],
  schedule: MetabookSpacedRepetitionSchedule,
) => {
  return intervalForContinuousLevel(
    getAverageLevel(intervals, schedule),
    schedule,
  );
};

export const projectedAverageIntervalAfterReview = (
  intervals: number[],
  schedule: MetabookSpacedRepetitionSchedule,
  accuracy = 0.85,
) => {
  const intervalSequence = schedulesToIntervalSequences[schedule];

  return getLogAverageInterval(
    intervals.map((interval) => {
      const newLevel =
        getLevelForInterval(interval, schedule) +
        (Math.random() > accuracy ? -1 : 1);
      return intervalSequence[
        Math.max(0, Math.min(intervalSequence.length - 1, newLevel))
      ].interval;
    }),
    schedule,
  );
};
*/
