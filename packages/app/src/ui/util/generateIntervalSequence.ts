import { SpacedRepetitionSchedulerConfiguration } from "@withorbit/core";

type ReviewIntervalMilliseconds = number;

// Deliberately naive here. This is fine for now.
const minutes: ReviewIntervalMilliseconds = 1000 * 60;
const days: ReviewIntervalMilliseconds = minutes * 60 * 24;

export function generateIntervalSequence(
  config: SpacedRepetitionSchedulerConfiguration,
) {
  // hard-coded values for the current default configuration. If this configuration changes
  // the sequence below must be updated accordingly.
  if (
    config.intervalGrowthFactor === 2.3 &&
    config.initialReviewInterval === 432000000 // five days
  ) {
    return [
      { interval: 0, label: "In-text" },
      { interval: 5 * days, label: "5d" },
      { interval: 11.5 * days, label: "2wk" },
      { interval: 26.45 * days, label: "1mo" },
      { interval: 60.835 * days, label: "2mo" },
      { interval: 139.9205 * days, label: "4mo" },
      { interval: 321.81715 * days, label: "1yr" },
    ];
  } else {
    throw new Error(
      "a fixed sequence is not defined for this scheduler configuration",
    );
  }
}
