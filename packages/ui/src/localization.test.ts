import { defaultSpacedRepetitionSchedulerConfiguration } from "@withorbit/core";
import { generateIntervalSequence } from "./util/generateIntervalSequence.js";
import { getReviewStrings, resolveOrbitLocale } from "./localization.js";

describe("resolveOrbitLocale", () => {
  it.each([
    ["en", "en"],
    ["en-US", "en"],
    ["zh-TW", "zh-TW"],
    ["zh_tw", "zh-TW"],
    ["zh-Hant", "zh-TW"],
    ["zh-HK", "zh-TW"],
    ["zh-MO", "zh-TW"],
    ["zh-Hant-HK", "zh-TW"],
    ["zh", "en"],
    ["zh-CN", "en"],
    ["fr", "en"],
    ["", "en"],
    [undefined, "en"],
  ] as const)("maps %s to %s", (input, expected) => {
    expect(resolveOrbitLocale(input)).toBe(expected);
  });
});

describe("getReviewStrings", () => {
  it("keeps the existing English review controls as the default", () => {
    const strings = getReviewStrings(undefined);

    expect(strings.showAnswer).toBe("Show Answer");
    expect(strings.remembered).toBe("Remembered");
    expect(strings.forgotten).toBe("Forgotten");
    expect(strings.skip).toBe("Skip");
  });

  it("provides complete zh-TW controls and interval labels", () => {
    const strings = getReviewStrings("zh-TW");
    const localizedIntervals = generateIntervalSequence(
      defaultSpacedRepetitionSchedulerConfiguration,
    ).map(({ label }) => strings.formatIntervalLabel(label));

    expect({
      showAnswer: strings.showAnswer,
      remembered: strings.remembered,
      rememberedNarrow: strings.rememberedNarrow,
      forgotten: strings.forgotten,
      forgottenNarrow: strings.forgottenNarrow,
      skip: strings.skip,
    }).toEqual({
      showAnswer: "顯示答案",
      remembered: "記得",
      rememberedNarrow: "記得",
      forgotten: "忘了",
      forgottenNarrow: "忘了",
      skip: "略過",
    });
    expect(localizedIntervals).toEqual([
      "文中",
      "5 天",
      "2 週",
      "1 個月",
      "2 個月",
      "4 個月",
      "1 年",
    ]);
  });
});
