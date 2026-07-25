export type OrbitLocale = "en" | "zh-TW";

export type ReviewIntervalLabel =
  "In-text" | "5d" | "2wk" | "1mo" | "2mo" | "4mo" | "1yr";

export interface ReviewStrings {
  showAnswer: string;
  skip: string;
  remembered: string;
  rememberedNarrow: string;
  succeeded: string;
  forgotten: string;
  forgottenNarrow: string;
  needsPractice: string;
  formatIntervalLabel: (label: ReviewIntervalLabel) => string;
}

const englishReviewStrings: ReviewStrings = {
  showAnswer: "Show Answer",
  skip: "Skip",
  remembered: "Remembered",
  rememberedNarrow: "Succeeded",
  succeeded: "Succeeded",
  forgotten: "Forgotten",
  forgottenNarrow: "Needs Work",
  needsPractice: "Needs Practice",
  formatIntervalLabel: (label) => label,
};

const zhTWIntervalLabels: Record<ReviewIntervalLabel, string> = {
  "In-text": "文中",
  "5d": "5 天",
  "2wk": "2 週",
  "1mo": "1 個月",
  "2mo": "2 個月",
  "4mo": "4 個月",
  "1yr": "1 年",
};

const zhTWReviewStrings: ReviewStrings = {
  showAnswer: "顯示答案",
  skip: "略過",
  remembered: "記得",
  rememberedNarrow: "記得",
  succeeded: "完成",
  forgotten: "忘了",
  forgottenNarrow: "忘了",
  needsPractice: "待練習",
  formatIntervalLabel: (label) => zhTWIntervalLabels[label],
};

const reviewStringsByLocale: Record<OrbitLocale, ReviewStrings> = {
  en: englishReviewStrings,
  "zh-TW": zhTWReviewStrings,
};

export function resolveOrbitLocale(
  locale: string | null | undefined,
): OrbitLocale {
  const subtags = locale
    ?.trim()
    .replaceAll("_", "-")
    .toLowerCase()
    .split("-")
    .filter(Boolean);

  // zh-HK and zh-MO are also Traditional script: Taiwan Mandarin wording is an
  // imperfect but far better fit for those readers than English.
  if (
    subtags?.[0] === "zh" &&
    ["tw", "hant", "hk", "mo"].some((subtag) => subtags.includes(subtag))
  ) {
    return "zh-TW";
  }
  return "en";
}

export function getReviewStrings(
  locale: string | null | undefined,
): ReviewStrings {
  return reviewStringsByLocale[resolveOrbitLocale(locale)];
}
