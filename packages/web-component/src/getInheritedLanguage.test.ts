import { getInheritedLanguage } from "./getInheritedLanguage.js";

describe("getInheritedLanguage", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("lang");
    document.body.replaceChildren();
  });

  it("uses an explicit language on the review area", () => {
    document.documentElement.lang = "en";
    const reviewArea = document.createElement("orbit-reviewarea");
    reviewArea.lang = "zh-TW";
    document.body.appendChild(reviewArea);

    expect(getInheritedLanguage(reviewArea)).toBe("zh-TW");
  });

  it("inherits the nearest ancestor language", () => {
    document.documentElement.lang = "en";
    const section = document.createElement("section");
    section.lang = "zh-Hant";
    const reviewArea = document.createElement("orbit-reviewarea");
    section.appendChild(reviewArea);
    document.body.appendChild(section);

    expect(getInheritedLanguage(reviewArea)).toBe("zh-Hant");
  });

  it("falls back to the document language and then English", () => {
    const reviewArea = document.createElement("orbit-reviewarea");

    document.documentElement.lang = "zh-TW";
    expect(getInheritedLanguage(reviewArea)).toBe("zh-TW");

    document.documentElement.removeAttribute("lang");
    expect(getInheritedLanguage(reviewArea)).toBe("en");
  });
});
