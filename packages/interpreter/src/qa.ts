import type { Paragraph, PhrasingContent, Root, RootContent } from "mdast";
import { sourceRange, type SourceRange } from "./markdown.js";

export type QAPrompt = {
  question: RootContent[];
  answer: RootContent[];
  // Fragments below have their prefixes removed for rendering. This separate
  // span refers to the untouched source, including Q./A., for source editing.
  range: SourceRange;
};

type AnswerStart = {
  block: number;
  child: number;
  match: RegExpExecArray;
};

/**
 * Extract root-level Q./A. regions, leaving ordinary Markdown for clozes.
 * Q. text / A. text consume one paragraph each; putting the prefix on its own
 * line enables multiple blocks, terminated by a heading, rule, another Q.,
 * or the export's standalone BearID metadata. Two blank lines between blocks
 * also end an answer.
 */
export function extractQAPrompts(root: Root): {
  prompts: QAPrompt[];
  remaining: Root;
} {
  const blocks = root.children;
  const prompts: QAPrompt[] = [];
  const remaining: RootContent[] = [];
  for (let start = 0; start < blocks.length; start++) {
    const prefix = questionPrefix(blocks[start]);
    const answerStart = prefix && findAnswer(blocks, start, prefix);
    if (!prefix || !answerStart) {
      remaining.push(blocks[start]);
      continue;
    }

    const { block: answerIndex, child, match } = answerStart;
    const [beforeAnswer, answerParagraph] = splitAnswer(
      blocks[answerIndex] as Paragraph,
      child,
      match,
    );
    const questionBlocks = blocks.slice(start, answerIndex);
    if (beforeAnswer) questionBlocks.push(beforeAnswer);

    let end = answerIndex + 1;
    if (isMultiblockPrefix(match))
      while (end < blocks.length && !isBoundary(blocks[end])) {
        // One blank line joins answer blocks; two end the answer. Use the
        // original positions, before prefix stripping or Markdown rendering.
        const lineGap =
          blocks[end].position!.start.line - blocks[end - 1].position!.end.line;
        if (lineGap >= 3) break;
        end++;
      }

    const question = omitEmptyPrefixParagraph(
      removeQuestionPrefix(questionBlocks, prefix[0].length),
    );
    const answer = omitEmptyPrefixParagraph([
      answerParagraph,
      ...blocks.slice(answerIndex + 1, end),
    ]);
    if (!question.length || !answer.length) {
      remaining.push(blocks[start]);
      continue;
    }
    prompts.push({
      question,
      answer,
      range: sourceRange(blocks[start], blocks[end - 1]),
    });
    start = end - 1;
  }
  return { prompts, remaining: { ...root, children: remaining } };
}

function questionPrefix(node: RootContent): RegExpExecArray | null {
  if (node.type !== "paragraph") return null;
  const first = node.children[0];
  if (first?.type !== "text") return null;
  const prefix = /^Q\.(\s+|$)/.exec(first.value);
  // A text-node ending is not necessarily a paragraph ending: Q.**text** is
  // still missing the required whitespace before its inline content.
  return prefix && (prefix[1] || node.children.length === 1) ? prefix : null;
}

function isMultiblockPrefix(prefix: RegExpExecArray): boolean {
  // Markdown drops a standalone marker's newline before another block.
  return prefix[1] === "" || prefix[1].endsWith("\n");
}

function omitEmptyPrefixParagraph(blocks: RootContent[]): RootContent[] {
  const first = blocks[0];
  return first?.type === "paragraph" &&
    first.children.every((node) => node.type === "text" && !node.value)
    ? blocks.slice(1)
    : blocks;
}

function isBoundary(node: RootContent): boolean {
  return (
    node.type === "heading" ||
    node.type === "thematicBreak" ||
    // Export metadata is not learning content or part of the editable answer.
    (node.type === "html" &&
      /^<!-- \{BearID:[0-9A-F-]+\} -->$/.test(node.value.trim())) ||
    !!questionPrefix(node)
  );
}

function findAnswer(
  blocks: RootContent[],
  start: number,
  prefix: RegExpExecArray,
): AnswerStart | undefined {
  const multiblock = isMultiblockPrefix(prefix);
  const limit = multiblock ? blocks.length : Math.min(start + 2, blocks.length);
  for (let block = start; block < limit; block++) {
    const node = blocks[block];
    if (block > start && isBoundary(node)) break;
    if (node.type !== "paragraph") continue;
    for (let child = 0; child < node.children.length; child++) {
      // A single-block answer in the following paragraph must start that
      // paragraph; an A. on an unrelated paragraph's later line is not enough.
      if (!multiblock && block > start && child > 0) break;
      const text = node.children[child];
      if (text.type !== "text") continue;
      const pattern =
        multiblock || block === start ? /^A\.(\s+|$)/m : /^A\.(\s+|$)/;
      const match = pattern.exec(text.value);
      if (match && (match[1] || child === node.children.length - 1))
        return { block, child, match };
    }
  }
}

function splitAnswer(
  paragraph: Paragraph,
  child: number,
  match: RegExpExecArray,
): [Paragraph | undefined, Paragraph] {
  const text = paragraph.children[child];
  if (text.type !== "text")
    throw new Error("Expected an answer prefix text node");
  const before: PhrasingContent[] = paragraph.children.slice(0, child);
  const leading = text.value.slice(0, match.index).trimEnd();
  if (leading) before.push({ type: "text", value: leading });
  const after: PhrasingContent[] = [
    { type: "text", value: text.value.slice(match.index + match[0].length) },
    ...paragraph.children.slice(child + 1),
  ];
  return [
    before.length ? { type: "paragraph", children: before } : undefined,
    { type: "paragraph", children: after },
  ];
}

function removeQuestionPrefix(
  blocks: RootContent[],
  length: number,
): RootContent[] {
  const first = blocks[0] as Paragraph;
  const text = first.children[0];
  if (text.type !== "text")
    throw new Error("Expected a question prefix text node");
  return [
    {
      type: "paragraph",
      children: [
        { type: "text", value: text.value.slice(length) },
        ...first.children.slice(1),
      ],
    },
    ...blocks.slice(1),
  ];
}
