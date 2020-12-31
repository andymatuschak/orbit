import {
  AttachmentIDReference,
  ClozePrompt,
  clozePromptType,
  QAPrompt,
  qaPromptType,
} from "metabook-core";
import { EmbeddedClozePrompt } from "metabook-embedded-support";
import { ReviewItem, styles } from "metabook-ui";
import {
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";
import { EmbeddedQAPrompt } from "../../../embedded-support/src/embeddedScreenInterface";

const testEmbeddedQAPrompt: EmbeddedQAPrompt = {
  type: qaPromptType,
  question: { contents: "question" },
  answer: { contents: "answer" },
};

const testBasicEmbeddedPromptsWithAttachments: EmbeddedQAPrompt = {
  type: qaPromptType,
  question: { contents: "q", attachmentURLs: ["test-a"] },
  answer: { contents: "a", attachmentURLs: ["test-b"] },
};

const testEmbeddedClozePrompt: EmbeddedClozePrompt = {
  type: clozePromptType,
  body: { contents: "Test {cloze}" },
};

const testColorPalette = styles.colors.palettes.red;
describe("getReviewItemFromEmbeddedItem", () => {
  test("qa prompt", () => {
    const attachmentResolutionMap = new Map();
    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: testEmbeddedQAPrompt,
      attachmentURLsToIDReferences: new Map(),
      attachmentResolutionMap: attachmentResolutionMap,
      colorPalette: testColorPalette,
    }) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect(reviewItem.provenance).toBeNull();
    expect(reviewItem.promptParameters).toBeNull();
    expect(reviewItem.attachmentResolutionMap).toBe(attachmentResolutionMap);
    expect((reviewItem.prompt as QAPrompt).question.contents).toEqual(
      "question",
    );
    expect((reviewItem.prompt as QAPrompt).answer.contents).toEqual("answer");
  });

  test("basic attachments", () => {
    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: testBasicEmbeddedPromptsWithAttachments,
      attachmentURLsToIDReferences: (new Map([
        ["test-a", "id-a"],
        ["test-b", "id-b"],
      ]) as unknown) as Map<string, AttachmentIDReference>,
      attachmentResolutionMap: new Map(),
      colorPalette: testColorPalette,
    }) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect((reviewItem.prompt as QAPrompt).question.attachments).toMatchObject([
      "id-a",
    ]);
    expect((reviewItem.prompt as QAPrompt).answer.attachments).toMatchObject([
      "id-b",
    ]);
  });

  test("cloze prompt", () => {
    const attachmentResolutionMap = new Map();
    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: testEmbeddedClozePrompt,
      attachmentURLsToIDReferences: new Map(),
      attachmentResolutionMap: attachmentResolutionMap,
      colorPalette: testColorPalette,
    }) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect((reviewItem.prompt as ClozePrompt).body.contents).toEqual(
      testEmbeddedClozePrompt.body.contents,
    );
  });
});

describe("getAttachmentURLsInEmbeddedItem", () => {
  test("no attachments", () => {
    expect(getAttachmentURLsInEmbeddedItem(testEmbeddedQAPrompt)).toMatchObject(
      [],
    );
  });

  test("attachments", () => {
    expect(
      getAttachmentURLsInEmbeddedItem(testBasicEmbeddedPromptsWithAttachments),
    ).toMatchObject(["test-a", "test-b"]);
  });
});
