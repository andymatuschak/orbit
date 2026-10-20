import { expect, test } from "bun:test";
import {
  findClozeBlocks,
  parseMarkdown,
  stringifyMarkdown,
} from "./markdown.js";
import { extractQAPrompts } from "./qa.js";

const fixtures: [string, string, [string, string][]][] = [
  ["two paragraphs", "Q. Question\n\nA. Answer", [["Question", "Answer"]]],
  ["one paragraph", "Q. Question\nA. Answer", [["Question", "Answer"]]],
  [
    "formatted question",
    "Q. A *question*\nA. Answer",
    [["A *question*", "Answer"]],
  ],
  [
    "wrapped lines",
    "Q. A question\ncontinued\nA. An answer\ncontinued",
    [["A question\ncontinued", "An answer\ncontinued"]],
  ],
  [
    "multiblock question",
    "Q.\nFirst\n\nSecond\n\nA. Answer",
    [["First\n\nSecond", "Answer"]],
  ],
  [
    "answer in last question block",
    "Q.\nFirst\n\nSecond\nA. Answer",
    [["First\n\nSecond", "Answer"]],
  ],
  [
    "multiblock answer",
    "Q. Question\nA.\nFirst\n\nSecond",
    [["Question", "First\n\nSecond"]],
  ],
  [
    "two consecutive blank lines end a multiblock answer",
    "Q. Question\nA.\nFirst\n\n\nOutside",
    [["Question", "First"]],
  ],
  [
    "three consecutive blank lines also end a multiblock answer",
    "Q. Question\nA.\nFirst\n\n\n\nOutside",
    [["Question", "First"]],
  ],
  [
    "whitespace-only blank lines end a multiblock answer",
    "Q. Question\nA.\nFirst\n \n\t\nOutside",
    [["Question", "First"]],
  ],
  [
    "two blank lines before the first answer block leave no answer",
    "Q. Question\nA.\n\n\nOutside",
    [],
  ],
  [
    "two blank lines do not terminate a multiblock question",
    "Q.\nFirst\n\n\nSecond\n\nA. Answer",
    [["First\n\nSecond", "Answer"]],
  ],
  [
    "blank lines inside fenced code are answer content",
    "Q. Question\nA.\n```text\nFirst\n\n\nSecond\n```\n\nLast paragraph",
    [["Question", "```text\nFirst\n\n\nSecond\n```\n\nLast paragraph"]],
  ],
  [
    "standalone answer before numbered list",
    "Q. Question\nA.\n1. First\n2. Second",
    [["Question", "1. First\n2. Second"]],
  ],
  [
    "standalone answer before bullet list",
    "Q. Question\nA.\n* First\n* Second",
    [["Question", "* First\n* Second"]],
  ],
  [
    "standalone answer before quotation",
    "Q. Question\nA.\n> Answer",
    [["Question", "> Answer"]],
  ],
  [
    "standalone answer before fenced code",
    "Q. Question\nA.\n```js\nconst answer = 42;\n```",
    [["Question", "```js\nconst answer = 42;\n```"]],
  ],
  [
    "standalone question before list",
    "Q.\n* First\n* Second\n\nA. Answer",
    [["* First\n* Second", "Answer"]],
  ],
  [
    "standalone question before quotation",
    "Q.\n> Question\n\nA. Answer",
    [["> Question", "Answer"]],
  ],
  [
    "standalone question before fenced code",
    "Q.\n```js\nquestion();\n```\n\nA. Answer",
    [["```js\nquestion();\n```", "Answer"]],
  ],
  [
    "blank lines after standalone question and answer",
    "Q.\n\nFirst\n\nSecond\n\nA.\n\nAnswer",
    [["First\n\nSecond", "Answer"]],
  ],
  [
    "heading terminates answer",
    "Q. Question\nA.\nFirst\n\nSecond\n\n# Heading",
    [["Question", "First\n\nSecond"]],
  ],
  [
    "rule terminates answer",
    "Q. Question\nA.\nFirst\n\nSecond\n\n---",
    [["Question", "First\n\nSecond"]],
  ],
  [
    "BearID export metadata terminates a multiblock answer",
    "Q. Question\nA.\nFirst\n\nSecond\n\n<!-- {BearID:ABC-123} -->",
    [["Question", "First\n\nSecond"]],
  ],
  [
    "a multiblock question cannot span BearID export metadata",
    "Q.\nQuestion\n\n<!-- {BearID:ABC-123} -->\n\nA. Answer",
    [],
  ],
  [
    "ordinary HTML comments remain answer content",
    "Q. Question\nA.\nFirst\n\n<!-- explanation -->\n\nSecond",
    [["Question", "First\n\n<!-- explanation -->\n\nSecond"]],
  ],
  [
    "inline BearID-looking comments do not terminate an answer",
    "Q. Question\nA.\nFirst <!-- {BearID:ABC-123} --> example.\n\nSecond",
    [["Question", "First <!-- {BearID:ABC-123} --> example.\n\nSecond"]],
  ],
  [
    "multiblock question and answer",
    "Q.\nFirst\n\n![](test.png)\n\nA.\nSecond\n\nThird\n\n---\n\nOutside",
    [["First\n\n![](test.png)", "Second\n\nThird"]],
  ],
  ["same-line answer is not a prompt", "Q. Question. A. Answer", []],
  ["unspaced question is not a prompt", "Q.Question\nA. Answer", []],
  ["unspaced answer is not a prompt", "Q. Question\nA.Answer", []],
  [
    "unspaced formatted question is not a standalone marker",
    "Q.**Question**\nA. Answer",
    [],
  ],
  [
    "unspaced formatted answer is not a standalone marker",
    "Q. Question\nA.**Answer**",
    [],
  ],
  ["standalone answer without content", "Q. Question\nA.", []],
  ["standalone question without content", "Q.\n\nA. Answer", []],
  [
    "boundary after a standalone answer does not create an empty prompt",
    "Q. Question\nA.\n\n---\n\nOutside",
    [],
  ],
  ["answer alone is not a prompt", "A. Answer", []],
  [
    "single-block question cannot skip a paragraph",
    "Q. Question\n\nOther paragraph\n\nA. Answer",
    [],
  ],
  ["heading terminates question", "Q.\nQuestion\n\n# Heading\n\nA. Answer", []],
  ["rule terminates question", "Q.\nQuestion\n\n---\n\nA. Answer", []],
  [
    "multiple prompts",
    "Q. First\n\nA. Answer\n\nQ. Second\n\nA. Another",
    [
      ["First", "Answer"],
      ["Second", "Another"],
    ],
  ],
  [
    "new question terminates answer",
    "Q. First\nA.\nOne\n\nTwo\n\nQ. Second\nA. Another",
    [
      ["First", "One\n\nTwo"],
      ["Second", "Another"],
    ],
  ],
  [
    "new question terminates unmatched question",
    "Q.\nUnmatched\n\nQ. Second\n\nA. Answer",
    [["Second", "Answer"]],
  ],
  [
    "later-line answer in another paragraph is unrelated",
    "Q. Question\n\nOther line.\nA. Answer",
    [],
  ],
  ["quoted QA is not root-level", "> Q. Question\n> A. Answer", []],
  ["listed QA is not root-level", "* Q. Question\n  A. Answer", []],
  ["unanswered question at EOF", "Q. Unanswered", []],
];

for (const [name, markdown, expected] of fixtures) {
  test(name, () => {
    const root = parseMarkdown(markdown);
    const original = structuredClone(root);
    const { prompts } = extractQAPrompts(root);
    expect(
      prompts.map(({ question, answer }) => [
        stringifyMarkdown(question),
        stringifyMarkdown(answer),
      ]),
    ).toEqual(expected);
    expect(root).toEqual(original);
    for (const { range } of prompts) {
      expect(markdown.slice(range.start, range.end).startsWith("Q.")).toBe(
        true,
      );
      expect(range.end).toBeLessThanOrEqual(markdown.length);
    }
  });
}

test("source spans remain exact across decoded entities, formatting, Unicode, and CRLF", () => {
  const body = "Q. &amp; *café* 😀\r\nA. An &#97;nswer";
  const source = `# Heading\r\n\r\n${body}\r\n\r\nOutside.`;
  const { prompts } = extractQAPrompts(parseMarkdown(source));
  expect(prompts).toHaveLength(1);
  expect(source.slice(prompts[0].range.start, prompts[0].range.end)).toBe(body);
  expect(stringifyMarkdown(prompts[0].question)).toBe("& *café* 😀");
  expect(stringifyMarkdown(prompts[0].answer)).toBe("An answer");
});

test("all answer blocks belong to the QA, not additional cloze tasks", () => {
  const source =
    "Q. Question\nA.\nFirst {blank}\n\nSecond {blank}\n\n---\n\nOutside {cloze}";
  const { prompts, remaining } = extractQAPrompts(parseMarkdown(source));
  expect(stringifyMarkdown(prompts[0].answer)).toBe(
    "First {blank}\n\nSecond {blank}",
  );
  const blocks = findClozeBlocks(remaining);
  expect(blocks).toHaveLength(1);
  expect(stringifyMarkdown(blocks)).toBe("Outside {cloze}");
});

test("a two-blank-line boundary retains exact source spans and leaves clozes outside", () => {
  for (const newline of ["\n", "\r\n"]) {
    const body = "Q. Question\nA.\n* First\n* Second".replaceAll("\n", newline);
    const source = `${body}${newline.repeat(3)}Outside {cloze}`;
    const { prompts, remaining } = extractQAPrompts(parseMarkdown(source));
    expect(prompts).toHaveLength(1);
    expect(source.slice(prompts[0].range.start, prompts[0].range.end)).toBe(
      body,
    );
    expect(stringifyMarkdown(prompts[0].answer)).toBe("* First\n* Second");
    expect(stringifyMarkdown(findClozeBlocks(remaining))).toBe(
      "Outside {cloze}",
    );
  }
});

test("blank lines inside a loose list do not split the answer's Markdown block", () => {
  const source = "Q. Question\nA.\n* First\n\n\n* Second\n\nLast paragraph";
  const { prompts, remaining } = extractQAPrompts(parseMarkdown(source));
  expect(prompts).toHaveLength(1);
  expect(prompts[0].answer.map((node) => node.type)).toEqual([
    "list",
    "paragraph",
  ]);
  expect(remaining.children).toEqual([]);
});
