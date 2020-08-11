import typedKeys from "../util/typedKeys";

export enum PromptRepetitionOutcome {
  Forgotten = "forgotten",
  Remembered = "remembered",
}
export type ReviewIntervalMilliseconds = number;

// Deliberately naive here. This is fine for now.
const minutes: ReviewIntervalMilliseconds = 1000 * 60;
const days: ReviewIntervalMilliseconds = minutes * 60 * 24;

export type MetabookSpacedRepetitionSchedule =
  | "original"
  | "aggressiveStart"
  | "default";

export type IntervalEntry = { interval: number; label: string };

const _originalIntervalSequence: IntervalEntry[] = [
  { interval: 10 * minutes, label: "Soon" },
  { interval: 1 * days, label: "1 day" },
  { interval: 3 * days, label: "3 days" },
  { interval: 7 * days, label: "1 week" },
  { interval: 14 * days, label: "2 weeks" },
  { interval: 31 * days, label: "1 month" },
  { interval: 62 * days, label: "2 months" },
  { interval: 124 * days, label: "4 months" },
];

const _aggressiveStartIntervalSequence: IntervalEntry[] = [
  { interval: 0, label: "In-text" },
  { interval: 5 * days, label: "5d" },
  { interval: 12 * days, label: "2wk" },
  { interval: 31 * days, label: "1mo" },
  { interval: 77 * days, label: "3mo" },
  { interval: 192 * days, label: "6mo" },
  { interval: 480 * days, label: "1yr+" },
];

const schedulesToIntervalSequences: Record<
  MetabookSpacedRepetitionSchedule,
  IntervalEntry[]
> = {
  original: _originalIntervalSequence,
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
