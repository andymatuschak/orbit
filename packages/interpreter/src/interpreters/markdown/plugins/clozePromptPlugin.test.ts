import { clozeNodeType, markdownProcessor } from "../markdown.js";
import promptProcessorPlugin from "./clozePromptPlugin.js";

const processor = markdownProcessor().use(promptProcessorPlugin);

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
        children: [{ type: "text", value: markdown }],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

// For now, let's say that the inner cloze "wins", like links.
// TODO: figure out what policy I actually want here.
test("parses nested braces", () => {
  const markdown = "This is {a {test}} of cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is {a " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "test" }],
          },
          { type: "text", value: "} of cloze" },
        ],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("doesn't parse clozes inside code blocks", () => {
  const markdown = "`{c}`";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [{ type: "inlineCode", value: "{c}" }],
      },
    ],
  });
});

test("doesn't parse clozes inside fenced code blocks", () => {
  const markdown = "```\n{c}\n```";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "code",
        value: "{c}",
      },
    ],
  });
});

test("doesn't parse clozes inside math", () => {
  const markdown = "${c}$";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "inlineMath",
            value: "{c}",
          },
        ],
      },
    ],
  });
});
