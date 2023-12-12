import mdast from "mdast";
import * as unified from "unified";
import unist from "unist";
import { parents } from "unist-util-parents";
import * as unistUtilSelect from "unist-util-select";
import { QAPromptNode, qaPromptNodeType } from "../markdown.js";

// TODO: don't match QA prompts inside coxde and html blocks
export default function qaPromptPlugin(this: unified.Processor) {
  return extractQAPromptNodes;
}

declare module "mdast" {
  interface RootContentMap {
    qaPromptNode: QAPromptNode;
  }
}

const questionPrefix = "Q. ";
const answerPrefix = "A. ";
const answerSplitRegexp = new RegExp(`\n${answerPrefix}`, "m");

type NodeWithParent<N extends unist.Node = unist.Node> = unist.Node & {
  parent?: NodeWithParent<unist.Parent>;
  node: N;
};

function extractQAPromptNodes(node: unist.Node): unist.Node {
  const nodeWithParents = parents(node);
  const answerNodes = unistUtilSelect.selectAll(
    `paragraph>text[value^='${answerPrefix}']`,
    nodeWithParents,
  ) as NodeWithParent[];
  for (const answerNode of answerNodes) {
    const parent = answerNode.parent!.parent!.node;
    const answerParagraphIndex = parent.children.indexOf(
      answerNode.parent!.node,
    );
    if (answerParagraphIndex === -1 || answerParagraphIndex === 0) {
      continue;
    }
    const questionParagraphNode = parent.children[
      answerParagraphIndex - 1
    ] as mdast.Paragraph;
    if (questionParagraphNode.type === "paragraph") {
      const questionTextNode = questionParagraphNode.children[0] as mdast.Text;
      if (
        questionParagraphNode.children.length === 1 &&
        questionTextNode.type === "text"
      ) {
        if (questionTextNode.value.startsWith(questionPrefix)) {
          // Now we'll strip the prefixes off.
          const answerParagraphNode = parent.children[
            answerParagraphIndex
          ] as mdast.Paragraph;
          questionTextNode.value = questionTextNode.value.slice(
            questionPrefix.length,
          );
          const answerTextNode = answerParagraphNode.children[0] as mdast.Text;
          answerTextNode.value = answerTextNode.value.slice(
            answerPrefix.length,
          );

          const qaPromptNode: QAPromptNode = {
            type: qaPromptNodeType,
            question: offsetNodePositionByPrefix(
              questionParagraphNode,
              questionPrefix,
            ),
            answer: offsetNodePositionByPrefix(
              answerParagraphNode,
              answerPrefix,
            ),
          };
          parent.children.splice(answerParagraphIndex - 1, 2, qaPromptNode);
        }
      }
    }
  }

  const questionNodes = unistUtilSelect.selectAll(
    `paragraph>text[value^='${questionPrefix}']`,
    nodeWithParents,
  ) as NodeWithParent[];
  for (const questionNode of questionNodes) {
    const paragraphNode = questionNode.parent!.node as mdast.Paragraph;
    const splitNodeIndex = paragraphNode.children.findIndex(
      (node) =>
        node.type === "text" &&
        answerSplitRegexp.test((node as mdast.Text).value),
    );
    if (splitNodeIndex === -1) {
      continue;
    }

    const splitNode = paragraphNode.children[splitNodeIndex] as mdast.Text;
    const match = splitNode.value.match(answerSplitRegexp)!;
    const preSplitString = splitNode.value.slice(0, match.index!);
    const postSplitString = splitNode.value.slice(match.index!);

    const questionPhrasingNodes = paragraphNode.children.slice(
      0,
      splitNodeIndex,
    );
    const answerPhrasingNodes = paragraphNode.children.slice(splitNodeIndex);
    if (preSplitString !== "" && answerPhrasingNodes[0].type === "text") {
      // We've gotta split that node.
      const splitNodeStart = splitNode.position!.start;
      const preSplitStringLines = preSplitString.split("\n");
      questionPhrasingNodes.push({
        type: "text",
        value: preSplitString,
        position: {
          start: splitNodeStart,
          end: {
            line: splitNodeStart.line + preSplitStringLines.length - 1,
            column: preSplitStringLines.at(-1)!.length,
            offset: splitNodeStart.offset! + preSplitString.length,
          },
        },
      });
      answerPhrasingNodes[0].value = postSplitString;
      // Correct the first answer phrasing node's position for the split.
      answerPhrasingNodes[0].position = {
        start: {
          line: splitNodeStart.line + preSplitStringLines.length,
          column: 1,
          offset: splitNodeStart.offset! + preSplitString.length + 1, // +1 for the newline
        },
        end: answerPhrasingNodes[0].position!.end,
      };
    } else {
      // The answer text is in its own node.
      // It's starting at the end of the previous line (before the \n); we need to shift it to the start of the next line.
      answerPhrasingNodes[0].position!.start.line += 1;
      answerPhrasingNodes[0].position!.start.column = 1;
      answerPhrasingNodes[0].position!.start.offset! += 1;
    }
    questionPhrasingNodes[0] = offsetNodePositionByPrefix(
      questionPhrasingNodes[0],
      questionPrefix,
    );
    answerPhrasingNodes[0] = offsetNodePositionByPrefix(
      answerPhrasingNodes[0],
      answerPrefix,
    );
    (questionPhrasingNodes[0] as mdast.Text).value = (
      questionPhrasingNodes[0] as mdast.Text
    ).value.slice(questionPrefix.length);
    (answerPhrasingNodes[0] as mdast.Text).value = (
      answerPhrasingNodes[0] as mdast.Text
    ).value.slice(
      answerPrefix.length + 1, // add 1 for the newline
    );

    const qaPromptNode: QAPromptNode = {
      type: qaPromptNodeType,
      question: {
        type: "paragraph",
        children: questionPhrasingNodes,
        position: {
          start: questionPhrasingNodes[0].position!.start,
          end: questionPhrasingNodes.at(-1)!.position!.end,
        },
      },
      answer: {
        type: "paragraph",
        children: answerPhrasingNodes,
        position: {
          start: answerPhrasingNodes[0].position!.start,
          end: answerPhrasingNodes.at(-1)!.position!.end,
        },
      },
    };
    const paragraphContainer = questionNode.parent!.parent!
      .node as unist.Parent;
    paragraphContainer.children.splice(
      paragraphContainer.children.indexOf(paragraphNode),
      1,
      qaPromptNode,
    );
  }

  return node;
}

function offsetNodePositionByPrefix<N extends mdast.Node>(
  node: N,
  prefix: string,
): N {
  const { position } = node;
  if (!position) {
    throw new Error("Node doesn't have a position");
  }
  if (position.start.offset === undefined) {
    throw new Error("position.start doesn't have an offset");
  }
  return {
    ...node,
    position: {
      ...position,
      start: {
        ...position.start,
        offset: position.start.offset! + prefix.length,
        column: position.start.column + prefix.length,
      },
    },
  };
}
