import { clozeNodeType, markdownProcessor } from "../markdown.js";
import promptProcessorPlugin from "./clozePromptPlugin.js";

const processor = markdownProcessor().use(promptProcessorPlugin);

test("parses cloze", () => {
  const markdown = "This is {a \\test} of cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "a \\test" }],
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

test("balances nested braces", () => {
  const markdown = "This is {a {test} of} cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "a {test} of" }],
          },
          { type: "text", value: " cloze" },
        ],
      },
    ],
  });

  // Note that the parser will escape the inactive cloze braces when stringifying.
  expect(processor.stringify(ast).trimRight()).toEqual(
    "This is {a \\{test\\} of} cloze",
  );
});

test("ignores unbalanced braces", () => {
  const markdown = "This is {a non-cloze";
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

test("ignores unbalanced nested braces", () => {
  const markdown = "This is {a {non-}cloze";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "This is {a " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "non-" }],
          },
          { type: "text", value: "cloze" },
        ],
      },
    ],
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("doesn't parse empty clozes", () => {
  const markdown = "This is {} a test";
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

test("doesn't parse clozes inside html blocks", () => {
  const markdown = "<div>{c}</div>";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "html",
        value: markdown,
      },
    ],
  });
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

// This test fails: the cloze parser removes trailing whitespace from the cloze. This happens because of our strategy for parsing the cloze interior: we emit a chunkText-type token for the interior. Then the tokenizer is run recursively over that interior. It turns the trailing whitespace into a lineSuffix node. That woudl be appropriate if the nested string were in fact a line, but of course it's not. This isn't important enough to me to fix right now.
test.failing("it leaves leading/trailing whitespace", () => {
  const markdown = "{ test }";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: clozeNodeType,
            children: [{ type: "text", value: " test " }],
          },
        ],
      },
    ],
  });
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("ignores escaped closing braces", () => {
  const markdown = "{a \\}test}";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "a }test" }],
          },
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
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
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
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
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
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});

test("it doesn't parse inline math spanning clozes", () => {
  const markdown = "{$x} a {$y} b";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "clozePromptNode",
            children: [{ type: "text", value: "$x" }],
          },
          { type: "text", value: " a " },
          {
            type: "clozePromptNode",
            children: [{ type: "text", value: "$y" }],
          },
          { type: "text", value: " b" },
        ],
      },
    ],
  });
  // Dollars will be escaped on output.
  expect(processor.stringify(ast).trimRight()).toEqual(`{\\$x} a {\\$y} b`);
});

test("it parses inline math inside clozes", () => {
  const markdown = "{a $x$ b}";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [
          {
            type: "clozePromptNode",
            children: [
              { type: "text", value: "a " },
              { type: "inlineMath", value: "x" },
              { type: "text", value: " b" },
            ],
          },
        ],
      },
    ],
  });
  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});
