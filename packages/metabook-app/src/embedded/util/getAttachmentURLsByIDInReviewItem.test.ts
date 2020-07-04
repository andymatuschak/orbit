import { AttachmentID, imageAttachmentType, Prompt } from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import getAttachmentURLsByIDInReviewItem from "./getAttachmentURLsByIDInReviewItem";

test("no attachments", () => {
  expect(
    getAttachmentURLsByIDInReviewItem(testBasicPrompt, new Map()),
  ).toMatchObject({});
});

const attachmentPrompt: Prompt = {
  ...testBasicPrompt,
  question: {
    ...testBasicPrompt.question,
    attachments: [
      { id: "x" as AttachmentID, byteLength: 0, type: imageAttachmentType },
    ],
  },
};
test("extracts attachment URL", () => {
  expect(
    getAttachmentURLsByIDInReviewItem(
      attachmentPrompt,
      new Map([
        ["x" as AttachmentID, { url: "test-url", type: imageAttachmentType }],
      ]),
    ),
  ).toMatchObject({ x: "test-url" });
});

test("throws for missing attachment URL", () => {
  expect(() =>
    getAttachmentURLsByIDInReviewItem(attachmentPrompt, new Map()),
  ).toThrow();
});
