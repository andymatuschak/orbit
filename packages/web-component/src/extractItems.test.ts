import {
  ClozeTaskContent,
  mainTaskComponentID,
  ReviewItem,
  QATaskContent,
  TaskContentType,
} from "@withorbit/core";
import { extractItems } from "./extractItems.js";

function getTestElement(reviewAreaInnerHTML: string): HTMLElement {
  document.body.innerHTML = `
<orbit-reviewarea id="test">
${reviewAreaInnerHTML}
</orbit-reviewarea>
`;
  return document.getElementById("test")!;
}

describe("qa prompts", () => {
  test("extracts qa prompt", () => {
    const element = getTestElement(`<orbit-prompt question="q" answer="a" />`);
    const record = extractItems(element);
    expect(record.reviewItems).toHaveLength(1);
    const reviewItem = record.reviewItems[0] as ReviewItem<QATaskContent>;
    expect(reviewItem.task.id).toMatchInlineSnapshot(
      `"Df1gGQHFUwK4Z_CmxCPjQg"`,
    ); // test stability
    expect(reviewItem.componentID).toEqual(mainTaskComponentID);
    expect(reviewItem.task.spec.content.type).toEqual(TaskContentType.QA);
    expect(reviewItem.task.spec.content.body.text).toEqual("q");
    expect(reviewItem.task.spec.content.answer.text).toEqual("a");
  });

  test("extracts attachments", () => {
    const element = getTestElement(
      `<orbit-prompt question="q" question-attachments="a1" answer="a" answer-attachments="a2" />`,
    );
    const record = extractItems(element);
    expect(record.reviewItems).toHaveLength(1);
    const reviewItem = record.reviewItems[0] as ReviewItem<QATaskContent>;
    expect(reviewItem.task.id).toMatchInlineSnapshot(
      `"uvAB-Y-XUJqsGrV0P9WD-Q"`,
    ); // test stability

    const qAttachments = reviewItem.task.spec.content.body.attachments;
    expect(qAttachments.length).toEqual(1);
    expect(qAttachments[0]).toMatchInlineSnapshot(`"K5LyLTy6WNa1H0sOpTESlA"`); // test stability

    const aAttachments = reviewItem.task.spec.content.answer.attachments;
    expect(aAttachments.length).toEqual(1);
    expect(aAttachments[0]).toMatchInlineSnapshot(`"ua-qbyxoWCScQyMPGMqH2w"`); // test stability

    expect(Object.keys(record.attachmentIDsToURLs).length).toEqual(2);
    expect(record.attachmentIDsToURLs[qAttachments[0]]).toEqual("a1");
    expect(record.attachmentIDsToURLs[aAttachments[0]]).toEqual("a2");
  });
});

test("cloze prompts", () => {
  const element = getTestElement(
    `<orbit-prompt cloze="test {foo} bar {baz} bat" />`,
  );
  const record = extractItems(element);
  expect(record.reviewItems).toHaveLength(1);
  const reviewItem = record.reviewItems[0] as ReviewItem<ClozeTaskContent>;
  expect(reviewItem.task.id).toMatchInlineSnapshot(`"vHab7kDvWA2fhvSJKDQesw"`); // test stability
  expect(reviewItem.componentID).toEqual("0");
  expect(reviewItem.task.spec.content.type).toEqual(TaskContentType.Cloze);
  expect(reviewItem.task.spec.content.body.text).toEqual(
    "test foo bar baz bat",
  );
  expect(Object.keys(reviewItem.task.spec.content.components).length).toEqual(
    2,
  );
});
