import { expect, test } from "bun:test";
import type { Root } from "mdast";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { clozeSyntax, type ClozeNode } from "./clozeSyntax.js";

const processor = unified()
  .use(remarkParse)
  .use(remarkStringify, {
    bullet: "*",
    emphasis: "*",
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  })
  .use(remarkMath)
  .use(clozeSyntax);

function paragraph(children: unknown[]) {
  return { children: [{ type: "paragraph", children }] };
}

function cloze(value: string): ClozeNode {
  return { type: "cloze", children: [{ type: "text", value }] };
}

function stringify(tree: Root): string {
  return processor.stringify(tree).trimEnd();
}

test("parses cloze", () => {
  const markdown = "This is {a \\test} of cloze";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(
    paragraph([
      { type: "text", value: "This is " },
      cloze("a \\test"),
      { type: "text", value: " of cloze" },
    ]),
  );
  expect(stringify(tree)).toBe(markdown);
});

test("parses cloze at end of line", () => {
  const markdown = "This is {a test}";
  expect(stringify(processor.parse(markdown))).toBe(markdown);
});

test.each(["This is {a test of cloze", "This is {a non-cloze"])(
  "does not parse unbalanced braces: %s",
  (markdown) => {
    const tree = processor.parse(markdown);
    expect(tree).toMatchObject(paragraph([{ type: "text", value: markdown }]));
    expect(stringify(tree)).toBe(markdown);
  },
);

test("balances nested braces without creating nested clozes", () => {
  const tree = processor.parse("This is {a {test} of} cloze");
  expect(tree).toMatchObject(
    paragraph([
      { type: "text", value: "This is " },
      cloze("a {test} of"),
      { type: "text", value: " cloze" },
    ]),
  );
  expect(stringify(tree)).toBe("This is {a \\{test\\} of} cloze");
});

test("an unclosed outer brace does not hide a balanced inner cloze", () => {
  const markdown = "This is {a {non-}cloze";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(
    paragraph([
      { type: "text", value: "This is {a " },
      cloze("non-"),
      { type: "text", value: "cloze" },
    ]),
  );
  expect(stringify(tree)).toBe(markdown);
});

test("does not parse empty clozes", () => {
  const markdown = "This is {} a test";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(paragraph([{ type: "text", value: markdown }]));
  expect(stringify(tree)).toBe(markdown);
});

test("does not parse clozes inside HTML blocks", () => {
  const markdown = "<div>{c}</div>";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject({ children: [{ type: "html", value: markdown }] });
  expect(stringify(tree)).toBe(markdown);
});

// chunkText subtokenization treats trailing cloze whitespace as a line suffix.
// Keep this existing limitation explicit rather than changing imported prompts.
test.skip("preserves leading and trailing whitespace", () => {
  const markdown = "{ test }";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(paragraph([cloze(" test ")]));
  expect(stringify(tree)).toBe(markdown);
});

test.each([
  ["{a \\}test}", "a }test", "{a \\}test}"],
  ["{a \\{test}", "a {test", "{a \\{test}"],
  ["{a \\\\test}", "a \\test", "{a \\test}"],
])(
  "ignores escaped braces and backslashes: %s",
  (markdown, value, canonical) => {
    const tree = processor.parse(markdown);
    expect(tree).toMatchObject(paragraph([cloze(value)]));
    expect(stringify(tree)).toBe(canonical);
  },
);

test("an unclosed cloze ending in a backslash is ordinary text, not a crash", () => {
  const markdown = "{trailing \\";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(paragraph([{ type: "text", value: markdown }]));
  expect(stringify(tree)).toBe(markdown + "\\");
});

test("a backslash before a newline retains the Markdown line break", () => {
  const markdown = "{a\\\nb}";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(
    paragraph([
      {
        type: "cloze",
        children: [
          { type: "text", value: "a" },
          { type: "break" },
          { type: "text", value: "b" },
        ],
      },
    ]),
  );
  expect(stringify(tree)).toBe(markdown);
});

test("a backslash at a paragraph boundary does not consume the end of input", () => {
  const tree = processor.parse("{a\\\n\nb}");
  expect(tree).toMatchObject({
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: "{a\\" }],
      },
      { type: "paragraph", children: [{ type: "text", value: "b}" }] },
    ],
  });
});

test("does not parse clozes inside inline code", () => {
  const markdown = "`{c}`";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(paragraph([{ type: "inlineCode", value: "{c}" }]));
  expect(stringify(tree)).toBe(markdown);
});

test("does not parse clozes inside fenced code blocks", () => {
  const markdown = "```\n{c}\n```";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject({ children: [{ type: "code", value: "{c}" }] });
  expect(stringify(tree)).toBe(markdown);
});

test("does not parse clozes inside math", () => {
  const markdown = "${c}$";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(paragraph([{ type: "inlineMath", value: "{c}" }]));
  expect(stringify(tree)).toBe(markdown);
});

test("does not parse inline math spanning clozes", () => {
  const tree = processor.parse("{$x} a {$y} b");
  expect(tree).toMatchObject(
    paragraph([
      cloze("$x"),
      { type: "text", value: " a " },
      cloze("$y"),
      { type: "text", value: " b" },
    ]),
  );
  expect(stringify(tree)).toBe("{\\$x} a {\\$y} b");
});

test("parses inline math inside clozes", () => {
  const markdown = "{a $x$ b}";
  const tree = processor.parse(markdown);
  expect(tree).toMatchObject(
    paragraph([
      {
        type: "cloze",
        children: [
          { type: "text", value: "a " },
          { type: "inlineMath", value: "x" },
          { type: "text", value: " b" },
        ],
      },
    ]),
  );
  expect(stringify(tree)).toBe(markdown);
});
