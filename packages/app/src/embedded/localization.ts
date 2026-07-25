import type { OrbitLocale, styles } from "@withorbit/ui";

export interface EmbeddedBannerMessageInputs {
  isSignedIn: boolean;
  completePromptCount: number;
  totalPromptCount: number;
  sizeClass: styles.layout.SizeClass;
  wasInitiallyComplete: boolean;
}

interface OnboardingStrings {
  heading: string;
  emailPlaceholder: string;
  emailPlaceholderCompact: string;
  signIn: string;
  continue: string;
  invalidEmail: string;
  explanation: string;
  callToActionPrefix: string;
  learnMore: string;
  callToActionSuffix: string;
}

export interface EndOfTaskLabelInputs {
  collectedPromptCount: number;
  totalPromptCount: number;
  hasPeerStates: boolean;
}

export interface EmbeddedStrings {
  savedToAccount: string;
  testMode: string;
  onboarding: OnboardingStrings;
  getBannerMessage: (inputs: EmbeddedBannerMessageInputs) => string;
  getEndOfTaskLabel: (inputs: EndOfTaskLabelInputs) => string;
}

function formatEnglishPromptCount(count: number): string {
  return count === 1 ? "1 prompt" : `${count} prompts`;
}

function formatZhTWPromptCount(count: number): string {
  return `${count} 題`;
}

const englishStrings: EmbeddedStrings = {
  savedToAccount: "Saved to your account:",
  testMode: "TEST MODE: Actions will not be saved.",
  onboarding: {
    heading: "Sign in to bring these ideas into your\u00a0Orbit",
    emailPlaceholder: "Enter your email address to sign in",
    emailPlaceholderCompact: "Enter your email address",
    signIn: "Sign in",
    continue: "Continue",
    invalidEmail: "Please enter a valid email address.",
    explanation:
      "We read so much but remember so little. Orbit helps you deeply internalize what you read through periodic review.",
    callToActionPrefix: "Sign in to get started or ",
    learnMore: "click here to learn more",
    callToActionSuffix: ".",
  },
  getBannerMessage: ({
    isSignedIn,
    completePromptCount,
    totalPromptCount,
    sizeClass,
    wasInitiallyComplete,
  }) => {
    if (!isSignedIn && completePromptCount === 0) {
      return sizeClass === "regular"
        ? "Quickly review what you just read."
        : "Quick review:";
    }
    if (completePromptCount >= totalPromptCount || wasInitiallyComplete) {
      return "Review complete";
    }
    if (completePromptCount === 0) {
      const promptCount = formatEnglishPromptCount(totalPromptCount);
      return sizeClass === "regular"
        ? `Review session: ${promptCount}`
        : `Review: ${promptCount}`;
    }
    if (completePromptCount < totalPromptCount) {
      const promptCount = formatEnglishPromptCount(
        totalPromptCount - completePromptCount,
      );
      return sizeClass === "regular"
        ? `Review session: ${promptCount} left`
        : `${promptCount} left`;
    }
    throw new Error("Unreachable");
  },
  getEndOfTaskLabel: ({
    collectedPromptCount,
    totalPromptCount,
    hasPeerStates,
  }) => {
    if (hasPeerStates) {
      return `${collectedPromptCount} of ${totalPromptCount} prompts on page collected`;
    }
    const promptString = totalPromptCount > 1 ? "prompts" : "prompt";
    return `${totalPromptCount} ${promptString} collected`;
  },
};

const zhTWStrings: EmbeddedStrings = {
  savedToAccount: "已儲存到你的帳號：",
  testMode: "測試模式：操作不會儲存。",
  onboarding: {
    heading: "登入，把這些想法收進你的\u00a0Orbit",
    emailPlaceholder: "輸入電子郵件地址以登入",
    emailPlaceholderCompact: "輸入電子郵件地址",
    signIn: "登入",
    continue: "繼續",
    invalidEmail: "請輸入有效的電子郵件地址。",
    explanation:
      "我們讀得很多，記住的卻很少。Orbit 透過定期複習，幫助你真正內化讀過的內容。",
    callToActionPrefix: "登入即可開始，或",
    learnMore: "點這裡進一步瞭解",
    callToActionSuffix: "。",
  },
  getBannerMessage: ({
    isSignedIn,
    completePromptCount,
    totalPromptCount,
    sizeClass,
    wasInitiallyComplete,
  }) => {
    if (!isSignedIn && completePromptCount === 0) {
      return sizeClass === "regular"
        ? "趁現在，快速複習剛讀過的內容。"
        : "快速複習：";
    }
    if (completePromptCount >= totalPromptCount || wasInitiallyComplete) {
      return "複習完成";
    }
    if (completePromptCount === 0) {
      const promptCount = formatZhTWPromptCount(totalPromptCount);
      return sizeClass === "regular"
        ? `這次複習：共 ${promptCount}`
        : `複習：${promptCount}`;
    }
    if (completePromptCount < totalPromptCount) {
      const promptCount = formatZhTWPromptCount(
        totalPromptCount - completePromptCount,
      );
      return sizeClass === "regular"
        ? `這次複習：還有 ${promptCount}`
        : `還有 ${promptCount}`;
    }
    throw new Error("Unreachable");
  },
  getEndOfTaskLabel: ({
    collectedPromptCount,
    totalPromptCount,
    hasPeerStates,
  }) =>
    hasPeerStates
      ? `本頁 ${totalPromptCount} 題中，已收錄 ${collectedPromptCount} 題`
      : `已收錄 ${totalPromptCount} 題`,
};

const stringsByLocale: Record<OrbitLocale, EmbeddedStrings> = {
  en: englishStrings,
  "zh-TW": zhTWStrings,
};

export function getEmbeddedStrings(locale: OrbitLocale): EmbeddedStrings {
  return stringsByLocale[locale];
}

export function getEmbeddedBannerMessage(
  locale: OrbitLocale,
  inputs: EmbeddedBannerMessageInputs,
): string {
  return getEmbeddedStrings(locale).getBannerMessage(inputs);
}

export function getEndOfTaskLabel(
  locale: OrbitLocale,
  inputs: EndOfTaskLabelInputs,
): string {
  return getEmbeddedStrings(locale).getEndOfTaskLabel(inputs);
}
