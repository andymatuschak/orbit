import { describe, test, expect } from "bun:test";
import {
  ClozeTaskContent,
  mainTaskComponentID,
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
    const reviewItem = record.reviewItems[0];
    const task = record.tasks[0];
    const content = task.spec.content as QATaskContent;
    expect(task.taskID).toMatchInlineSnapshot(`"Df1gGQHFUwK4Z_CmxCPjQg"`); // test stability
    expect(reviewItem.componentID).toEqual(mainTaskComponentID);
    expect(content.type).toEqual(TaskContentType.QA);
    expect(content.body.text).toEqual("q");
    expect(content.answer.text).toEqual("a");
  });

  test("extracts attachments", () => {
    const element = getTestElement(
      `<orbit-prompt question="q" question-attachments="a1" answer="a" answer-attachments="a2" />`,
    );
    const record = extractItems(element);
    expect(record.reviewItems).toHaveLength(1);
    const task = record.tasks[0];
    const content = task.spec.content as QATaskContent;
    expect(record.reviewItems[0].taskID).toBe(task.taskID);
    expect(task.taskID).toMatchInlineSnapshot(`"uvAB-Y-XUJqsGrV0P9WD-Q"`); // test stability

    const qAttachments = content.body.attachments;
    expect(qAttachments.length).toEqual(1);
    expect(qAttachments[0]).toMatchInlineSnapshot(`"K5LyLTy6WNa1H0sOpTESlA"`); // test stability

    const aAttachments = content.answer.attachments;
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
  const reviewItem = record.reviewItems[0];
  const task = record.tasks[0];
  const content = task.spec.content as ClozeTaskContent;
  expect(task.taskID).toMatchInlineSnapshot(`"vHab7kDvWA2fhvSJKDQesw"`); // test stability
  expect(reviewItem.componentID).toEqual("0");
  expect(content.type).toEqual(TaskContentType.Cloze);
  expect(content.body.text).toEqual("test foo bar baz bat");
  expect(Object.keys(content.components).length).toEqual(2);
});
