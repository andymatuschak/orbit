import { AttachmentIDReference, QAPrompt, qaPromptType } from "metabook-core";
import { ReviewItem } from "metabook-ui";
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

describe("getReviewItemFromEmbeddedItem", () => {
  test("qa prompt", () => {
    const attachmentResolutionMap = new Map();
    const reviewItem = getReviewItemFromEmbeddedItem(
      testEmbeddedQAPrompt,
      new Map(),
      attachmentResolutionMap,
    ) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect(reviewItem.promptState).toBeNull();
    expect(reviewItem.promptParameters).toBeNull();
    expect(reviewItem.attachmentResolutionMap).toBe(attachmentResolutionMap);
    expect((reviewItem.prompt as QAPrompt).question.contents).toEqual(
      "question",
    );
    expect((reviewItem.prompt as QAPrompt).answer.contents).toEqual("answer");
  });

  test("basic attachments", () => {
    const reviewItem = getReviewItemFromEmbeddedItem(
      testBasicEmbeddedPromptsWithAttachments,
      (new Map([
        ["test-a", "id-a"],
        ["test-b", "id-b"],
      ]) as unknown) as Map<string, AttachmentIDReference>,
      new Map(),
    ) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect((reviewItem.prompt as QAPrompt).question.attachments).toMatchObject([
      "id-a",
    ]);
    expect((reviewItem.prompt as QAPrompt).answer.attachments).toMatchObject([
      "id-b",
    ]);
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
