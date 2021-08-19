import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { clozeNodeType } from "./index";
import promptProcessorPlugin from "./clozePromptPlugin";

export const processor = unified()
  .use(remarkParse)
  .use(remarkStringify)
  .use(promptProcessorPlugin);

test("parses cloze", () => {
  const markdown = "This is {a test} of cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "a test" }],
          },
          { type: "text", value: " of cloze" },
        ],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("parses cloze at end of line", () => {
  const markdown = "This is {a test}";
  const ast = processor.parse(markdown);
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("doesn't parse unbalanced braces", () => {
  const markdown = "This is {a test of cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: markdown },
        ],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("parses nested braces", () => {
  const markdown = "This is {a {test}} of cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "a {test}" }],
          },
          { type: "text", value: " of cloze" },
        ],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});
