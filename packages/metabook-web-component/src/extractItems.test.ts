import { extractItems } from "./extractItems";

function getTestElement(reviewAreaInnerHTML: string): HTMLElement {
  document.body.innerHTML = `
<orbit-reviewarea id="test">
${reviewAreaInnerHTML}
</orbit-reviewarea>
`;
  return document.getElementById("test")!;
}

describe("basic prompts", () => {
  test("extracts basic prompt", () => {
    const element = getTestElement(`<orbit-prompt question="q" answer="a" />`);
    const items = extractItems(element);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      question: { contents: "q" },
      answer: { contents: "a" },
    });
  });

  test("extracts attachments", () => {
    const element = getTestElement(
      `<orbit-prompt question="q" question-attachments="a1" answer="a" answer-attachments="a2" />`,
    );
    const items = extractItems(element);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      question: { attachmentURLs: ["a1"] },
      answer: { attachmentURLs: ["a2"] },
    });
  });
});
