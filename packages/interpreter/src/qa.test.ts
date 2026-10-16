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
