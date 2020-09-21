import {
  AttachmentIDReference,
  BasicPrompt,
  basicPromptType,
} from "metabook-core";
import { ReviewItem } from "metabook-ui";
import {
  EmbeddedBasicPrompt,
  getAttachmentURLsInEmbeddedItem,
  getReviewItemFromEmbeddedItem,
} from "./embeddedItem";

const testEmbeddedBasicPrompt: EmbeddedBasicPrompt = {
  type: basicPromptType,
  question: { contents: "question" },
  answer: { contents: "answer" },
};

const testBasicEmbeddedPromptsWithAttachments: EmbeddedBasicPrompt = {
  type: basicPromptType,
  question: { contents: "q", attachmentURLs: ["test-a"] },
  answer: { contents: "a", attachmentURLs: ["test-b"] },
};

describe("getReviewItemFromEmbeddedItem", () => {
  test("basic prompt", () => {
    const attachmentResolutionMap = new Map();
    const reviewItem = getReviewItemFromEmbeddedItem(
      testEmbeddedBasicPrompt,
      new Map(),
      attachmentResolutionMap,
    ) as ReviewItem;
    expect(reviewItem).not.toBeInstanceOf(Error);
    expect(reviewItem.promptState).toBeNull();
    expect(reviewItem.promptParameters).toBeNull();
    expect(reviewItem.attachmentResolutionMap).toBe(attachmentResolutionMap);
    expect((reviewItem.prompt as BasicPrompt).question.contents).toEqual(
      "question",
    );
    expect((reviewItem.prompt as BasicPrompt).answer.contents).toEqual(
      "answer",
    );
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
    expect(
      (reviewItem.prompt as BasicPrompt).question.attachments,
    ).toMatchObject(["id-a"]);
    expect(
      (reviewItem.prompt as BasicPrompt).answer.attachments,
    ).toMatchObject(["id-b"]);
  });
});

describe("getAttachmentURLsInEmbeddedItem", () => {
  test("no attachments", () => {
    expect(
      getAttachmentURLsInEmbeddedItem(testEmbeddedBasicPrompt),
    ).toMatchObject([]);
  });

  test("attachments", () => {
    expect(
      getAttachmentURLsInEmbeddedItem(testBasicEmbeddedPromptsWithAttachments),
    ).toMatchObject(["test-a", "test-b"]);
  });
});
