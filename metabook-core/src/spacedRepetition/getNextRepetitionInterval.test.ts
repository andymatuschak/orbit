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
            reviewIntervalMillis: sequence[levelIndex].interval,
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
                currentlyNeedsRetry: false,
                outcome: PromptRepetitionOutcome.Remembered,
                supportsRetry,
              }),
            ).toEqual(sequence[levelIndex + 1].interval),
        );

        test("level doesn't increases at last level", () => {
          const lastLevelIntervalMillis =
            sequence[sequence.length - 1].interval;
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: lastLevelIntervalMillis,
              currentlyNeedsRetry: false,
              outcome: PromptRepetitionOutcome.Remembered,
              supportsRetry,
            }),
          ).toEqual(lastLevelIntervalMillis);
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
              reviewIntervalMillis: sequence[levelIndex].interval,
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
        "drops a level when currentlyNeedsRetry=%p",
        (currentlyNeedsRetry) => {
          expect(
            getNextRepetitionInterval({
              schedule,
              reviewIntervalMillis: sequence[levelIndex].interval,
              supportsRetry: true,
              currentlyNeedsRetry,
              outcome: PromptRepetitionOutcome.Forgotten,
            }),
          ).toEqual(sequence[levelIndex - 1].interval);
        },
      );
    });
  });
});
