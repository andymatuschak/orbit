import {
  getEmbeddedBannerMessage,
  getEmbeddedStrings,
  getEndOfTaskLabel,
} from "./localization.js";

const initialBannerInputs = {
  isSignedIn: false,
  completePromptCount: 0,
  totalPromptCount: 3,
  sizeClass: "regular" as const,
  wasInitiallyComplete: false,
};

describe("embedded localization", () => {
  it("preserves the existing English banner copy by default", () => {
    expect(getEmbeddedBannerMessage("en", initialBannerInputs)).toBe(
      "Quickly review what you just read.",
    );
    expect(
      getEmbeddedBannerMessage("en", {
        ...initialBannerInputs,
        isSignedIn: true,
      }),
    ).toBe("Review session: 3 prompts");
    expect(
      getEmbeddedBannerMessage("en", {
        ...initialBannerInputs,
        isSignedIn: true,
        completePromptCount: 2,
      }),
    ).toBe("Review session: 1 prompt left");
  });

  it("formats every zh-TW banner state", () => {
    expect(getEmbeddedBannerMessage("zh-TW", initialBannerInputs)).toBe(
      "趁現在，快速複習剛讀過的內容。",
    );
    expect(
      getEmbeddedBannerMessage("zh-TW", {
        ...initialBannerInputs,
        isSignedIn: true,
      }),
    ).toBe("這次複習：共 3 題");
    expect(
      getEmbeddedBannerMessage("zh-TW", {
        ...initialBannerInputs,
        isSignedIn: true,
        completePromptCount: 2,
      }),
    ).toBe("這次複習：還有 1 題");
    expect(
      getEmbeddedBannerMessage("zh-TW", {
        ...initialBannerInputs,
        isSignedIn: true,
        completePromptCount: 3,
      }),
    ).toBe("複習完成");
  });

  it("formats completion labels for local and page-wide review queues", () => {
    expect(
      getEndOfTaskLabel("en", {
        collectedPromptCount: 1,
        totalPromptCount: 1,
        hasPeerStates: true,
      }),
    ).toBe("1 of 1 prompts on page collected");
    expect(
      getEndOfTaskLabel("en", {
        collectedPromptCount: 0,
        totalPromptCount: 0,
        hasPeerStates: false,
      }),
    ).toBe("0 prompt collected");
    expect(
      getEndOfTaskLabel("zh-TW", {
        collectedPromptCount: 1,
        totalPromptCount: 3,
        hasPeerStates: false,
      }),
    ).toBe("已收錄 3 題");
    expect(
      getEndOfTaskLabel("zh-TW", {
        collectedPromptCount: 2,
        totalPromptCount: 3,
        hasPeerStates: true,
      }),
    ).toBe("本頁 3 題中，已收錄 2 題");
  });

  it("provides complete zh-TW onboarding and status copy", () => {
    const strings = getEmbeddedStrings("zh-TW");

    expect(strings.savedToAccount).toBe("已儲存到你的帳號：");
    expect(strings.testMode).toBe("測試模式：操作不會儲存。");
    expect(strings.onboarding).toMatchObject({
      heading: "登入，把這些想法收進你的 Orbit",
      emailPlaceholder: "輸入電子郵件地址以登入",
      signIn: "登入",
      continue: "繼續",
      invalidEmail: "請輸入有效的電子郵件地址。",
      learnMore: "點這裡進一步瞭解",
    });
  });
});
