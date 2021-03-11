import { EmbeddedClozePrompt, ReviewItem } from "@withorbit/embedded-support";
import {
  ClozePrompt,
  clozePromptType,
  getIDForAttachment,
  imageAttachmentType,
  QAPrompt,
  qaPromptType,
} from "@withorbit/core";
import { styles } from "metabook-ui";
import { EmbeddedQAPrompt } from "../../../embedded-support/src/embeddedScreenInterface";
import {
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";

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
    }) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect(reviewItem.promptParameters).toBeNull();
    expect(reviewItem.attachmentResolutionMap).toBe(attachmentResolutionMap);
    expect((reviewItem.prompt as QAPrompt).question.contents).toEqual(
      "question",
    );
    expect((reviewItem.prompt as QAPrompt).answer.contents).toEqual("answer");
  });

  test("basic attachments", async () => {
    const attachmentIDA = await getIDForAttachment(Buffer.from("a"));
    const attachmentIDB = await getIDForAttachment(Buffer.from("b"));

    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: testBasicEmbeddedPromptsWithAttachments,
      attachmentURLsToIDReferences: new Map([
        [
          "test-a",
          { type: imageAttachmentType, id: attachmentIDA, byteLength: 1 },
        ],
        [
          "test-b",
          { type: imageAttachmentType, id: attachmentIDB, byteLength: 1 },
        ],
      ]),
      attachmentResolutionMap: new Map(),
    }) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect((reviewItem.prompt as QAPrompt).question.attachments[0].id).toEqual(
      attachmentIDA,
    );
    expect((reviewItem.prompt as QAPrompt).answer.attachments[0].id).toEqual(
      attachmentIDB,
    );
  });

  test("cloze prompt", () => {
    const attachmentResolutionMap = new Map();
    const reviewItem = getReviewItemFromEmbeddedItem({
      embeddedItem: testEmbeddedClozePrompt,
      attachmentURLsToIDReferences: new Map(),
      attachmentResolutionMap: attachmentResolutionMap,
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
