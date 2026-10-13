import mdast from "mdast";
import * as unified from "unified";
import { QAPromptNode, qaPromptNodeType } from "../markdown.js";

export default function qaPromptPlugin(this: unified.Processor) {
  return extractQAPromptNodes;
}

declare module "mdast" {
  interface RootContentMap {
    qaPromptNode: QAPromptNode;
  }
}

const questionPrefixRegexp = /^Q\.(\s+)/;

// If the answer prefix appears in the same paragraph block as the question, or if it's in multiblock mode, it can be on a line after the first line (i.e. via hard wrapping).
const answerPrefixRegexpMultiline = /^A\.(\s+)/m;
// But in later paragraph blocks, it must start the paragraph.
const answerPrefixRegexp = /^A\.(\s+)/;
// Note that the answer prefix regexp has the multiline flag set. It can appear mid-"paragraph" because in Markdown, a single line break doesn't end a paragraph.

function matchQuestionPrefix(node: mdast.RootContent): RegExpMatchArray | null {
  if (node.type !== "paragraph") return null;
  // The "Q." prefix must be the start of the paragraph.
  const qPrefixContentNode = node.children[0];
  if (!qPrefixContentNode) return null;
  if (qPrefixContentNode.type !== "text") return null;

  return qPrefixContentNode.value.match(questionPrefixRegexp);
}

function isMultiblockTerminator(node: mdast.RootContent): boolean {
  return node.type === "thematicBreak" || node.type === "heading";
}

function extractQAPromptNodes(root: mdast.Node): mdast.Node {
  // We only parse root-level paragraphs for the q/a syntax.
  if (!("children" in root)) {
    return root;
  }
  const rootContent = root.children as mdast.RootContent[];
  for (let qBlockIndex = 0; qBlockIndex < rootContent.length; qBlockIndex++) {
    const qBlock = rootContent[qBlockIndex];
    if (qBlock.type !== "paragraph") continue;
    const qPrefixMatch = matchQuestionPrefix(qBlock);
    if (!qPrefixMatch) continue;
    const qIsMultiBlock = qPrefixMatch[1].endsWith("\n");

    // OK, now we've got a paragraph that starts with "Q."
    // Scan forward and try to find an "^A." before the next heading or thematic break.
    let aBlockIndex = qBlockIndex; // the index of the block in rootContent containing the answer prefix
    let aContentIndex = 0; // the index of the content node in that block containing the answer prefix
    let aPrefixMatch: RegExpMatchArray | null = null;
    for (
      aBlockIndex = qBlockIndex;
      qIsMultiBlock
        ? aBlockIndex < rootContent.length
        : aBlockIndex <= qBlockIndex + 1;
      aBlockIndex++
    ) {
      const aBlock = rootContent[aBlockIndex];
      if (
        isMultiblockTerminator(aBlock) ||
        // Bail if we find another question prefix before the answer prefix.
        (aBlockIndex > qBlockIndex && matchQuestionPrefix(aBlock))
      )
        break;

      // For paragraphs, check each text node for "^A.".
      if (aBlock.type !== "paragraph") continue;
      for (
        aContentIndex = 0;
        qIsMultiBlock
          ? aContentIndex < aBlock.children.length
          : // If the question is not multiblock, the answer must begin the next paragraph.
            aBlockIndex === qBlockIndex
            ? aContentIndex < aBlock.children.length
            : aContentIndex === 0;
        aContentIndex++
      ) {
        const content = aBlock.children[aContentIndex];
        if (content.type !== "text") continue;

        aPrefixMatch = content.value.match(
          qIsMultiBlock || aBlockIndex === qBlockIndex
            ? answerPrefixRegexpMultiline
            : answerPrefixRegexp,
        );
        if (aPrefixMatch) break;
      }
      if (aPrefixMatch) break;
    }

    if (!aPrefixMatch) continue;

    // If the answer prefix comes mid-content node (as in the example below, we need to split the content node.
    // Q. Foo
    // A. Bar
    if (aPrefixMatch.index !== 0) {
      const aBlock = rootContent[aBlockIndex] as mdast.Paragraph;
      const splitNode = aBlock.children[aContentIndex] as mdast.Text;
      const splitText = splitNode.value;
      // The text before the answer prefix will become part of the question.
      splitNode.value = splitText.slice(0, aPrefixMatch.index).trimEnd();
      const newTextNode: mdast.Text = {
        type: "text",
        value: splitText.slice(aPrefixMatch.index),
      };

      // Fix up the line / column / offset position values for the split.
      if (splitNode.position) {
        const qLines = splitNode.value.split("\n");
        const aLineCount = newTextNode.value.split("\n").length;
        const aLineNumber = splitNode.position.end.line - aLineCount + 1;
        newTextNode.position = {
          start: {
            column: 1,
            line: aLineNumber,
          },
          end: { ...splitNode.position.end },
        };
        splitNode.position.end = {
          line: splitNode.position.start.line + qLines.length - 1,
          column: qLines.at(-1)!.length,
        };
        if (splitNode.position.start.offset !== undefined) {
          newTextNode.position.start.offset =
            aPrefixMatch.index! + splitNode.position.start.offset;
          splitNode.position.end.offset =
            splitNode.position.start.offset + splitNode.value.length;
        }
      }
      aBlock.children.splice(aContentIndex + 1, 0, newTextNode);
      aContentIndex++;
    }

    // Now the answer prefix is at the start of a content node. But if that node is not at the start of a paragraph block, we must split it.
    if (aContentIndex !== 0) {
      const splitBlock = rootContent[aBlockIndex] as mdast.Paragraph;
      const aPrefixText = splitBlock.children[aContentIndex];
      const aContentNodes = splitBlock.children.slice(aContentIndex);
      // The content nodes before the answer prefix will become part of the question.
      splitBlock.children = splitBlock.children.slice(0, aContentIndex);
      const newABlock: mdast.Paragraph = {
        type: "paragraph",
        children: aContentNodes,
      };

      // Fix up the position structures for the split.
      if (splitBlock.position) {
        if (aPrefixText.position) {
          newABlock.position = {
            start: aPrefixText.position.start,
            end: { ...splitBlock.position.end },
          };
        }
        const lastSplitBlockContentNode = splitBlock.children.at(-1);
        if (lastSplitBlockContentNode?.position) {
          splitBlock.position.end = {
            ...splitBlock.children.at(-1)!.position!.end,
          };
        } else {
          splitBlock.position = undefined;
        }
      }
      rootContent.splice(aBlockIndex + 1, 0, newABlock);
      aBlockIndex++;
      aContentIndex = 0;
    }

    // If the answer block is multiline, then it'll end at the next heading, ---, or eof.
    let afterABlockIndex = aBlockIndex + 1;
    if (aPrefixMatch[1].endsWith("\n")) {
      while (afterABlockIndex < rootContent.length) {
        const block = rootContent[afterABlockIndex];
        if (isMultiblockTerminator(block) || matchQuestionPrefix(block)) {
          break;
        }
        afterABlockIndex++;
      }
    }

    // Remove the question prefix from the content.
    const qPrefixContentNode = qBlock.children[0] as mdast.Text;
    qPrefixContentNode.value = qPrefixContentNode.value.slice(
      qPrefixMatch[0].length,
    );

    // Remove the answer prefix from its content node.
    const aBlock = rootContent[aBlockIndex] as mdast.Paragraph;
    const aPrefixText = aBlock.children[aContentIndex] as mdast.Text;
    aPrefixText.value = aPrefixText.value.slice(aPrefixMatch[0].length);

    const qaPromptNode = {
      type: qaPromptNodeType,
      question: rootContent.slice(qBlockIndex, aBlockIndex),
      answer: rootContent.slice(aBlockIndex, afterABlockIndex),
    } satisfies QAPromptNode;
    rootContent.splice(
      qBlockIndex,
      aBlockIndex - qBlockIndex + 1, // TODO: support multiblock answers
      qaPromptNode,
    );
  }
  return root;
}
