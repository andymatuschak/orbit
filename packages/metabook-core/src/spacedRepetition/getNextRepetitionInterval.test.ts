import { getNextRepetitionInterval } from "./getNextRepetitionInterval";
import {
  getIntervalSequenceForSchedule,
  PromptRepetitionOutcome,
} from "./spacedRepetition";

describe("default schedule", () => {
  const schedule = "default";
  const sequence = getIntervalSequenceForSchedule(schedule);

  describe("remembered", () => {
    describe("when currentlyNeedsRetry", () => {
      test.each([false, true])(
        "level increases when retrying level-0 prompt with supportsRetry=%p",
        (supportsRetry) => {
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: sequence[0].interval,
              scheduledIntervalMillis: sequence[0].interval,
              currentlyNeedsRetry: true,
              outcome: PromptRepetitionOutcome.Remembered,
              supportsRetry,
            }),
          ).toEqual(sequence[1].interval);
        },
      );

      test.each(
        Array.from(new Array(sequence.length - 1).keys()).map((i) => i + 1),
      )("level doesn't increase for level-%i prompts", (levelIndex) =>
        expect(
          getNextRepetitionInterval({
            schedule,
            reviewIntervalMillis: sequence[levelIndex].interval + 1000,
            scheduledIntervalMillis: sequence[levelIndex].interval,
            currentlyNeedsRetry: true,
            outcome: PromptRepetitionOutcome.Remembered,
            supportsRetry: true,
          }),
        ).toEqual(sequence[levelIndex].interval),
      );
    });

    describe.each([false, true])(
      "when doesn't need retry, supportsRetry=%p",
      (supportsRetry) => {
        test.each(Array.from(new Array(sequence.length - 1).keys()))(
          "level increases for level-%i prompts",
          (levelIndex) =>
            expect(
              getNextRepetitionInterval({
                schedule,
                reviewIntervalMillis: sequence[levelIndex].interval,
                scheduledIntervalMillis: sequence[levelIndex].interval,
                currentlyNeedsRetry: false,
                outcome: PromptRepetitionOutcome.Remembered,
                supportsRetry,
              }),
            ).toBeGreaterThan(sequence[levelIndex].interval),
        );

        test("gives credit for real interval", () => {
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: sequence[2].interval * 4,
              scheduledIntervalMillis: sequence[2].interval,
              currentlyNeedsRetry: false,
              outcome: PromptRepetitionOutcome.Remembered,
              supportsRetry,
            }),
          ).toBeGreaterThan(sequence[3].interval);
        });

        test("level keeps increasing at last level", () => {
          const lastLevelIntervalMillis =
            sequence[sequence.length - 1].interval;
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: lastLevelIntervalMillis * 2,
              scheduledIntervalMillis: lastLevelIntervalMillis * 2,
              currentlyNeedsRetry: false,
              outcome: PromptRepetitionOutcome.Remembered,
              supportsRetry,
            }),
          ).toBeGreaterThan(lastLevelIntervalMillis * 2);
        });
      },
    );
  });

  describe("forgotten", () => {
    describe.each([0, 1])("when on early level %i", (levelIndex) => {
      test.each([false, true])(
        "maintains current level when supportsRetry and currentlyNeedsRetry=%p",
        (currentlyNeedsRetry) => {
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: 1000,
              scheduledIntervalMillis: sequence[levelIndex].interval,
              supportsRetry: true,
              currentlyNeedsRetry,
              outcome: PromptRepetitionOutcome.Forgotten,
            }),
          ).toEqual(sequence[levelIndex].interval);
        },
      );
    });

    describe.each(
      Array.from(new Array(sequence.length - 2).keys()).map((i) => i + 2),
    )("from level %i", (levelIndex) => {
      test.each([false, true])(
        "drops when currentlyNeedsRetry=%p",
        (currentlyNeedsRetry) => {
          const nextInterval = getNextRepetitionInterval({
            schedule,
            reviewIntervalMillis: 1000,
            scheduledIntervalMillis: sequence[levelIndex].interval,
            supportsRetry: true,
            currentlyNeedsRetry,
            outcome: PromptRepetitionOutcome.Forgotten,
          });
          expect(nextInterval).toBeLessThan(sequence[levelIndex].interval);
          expect(nextInterval).toBeGreaterThan(1000);
        },
      );
    });
  });
});
