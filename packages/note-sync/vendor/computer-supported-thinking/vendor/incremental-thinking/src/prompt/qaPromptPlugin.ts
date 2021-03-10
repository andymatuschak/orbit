import mdast from "mdast";
import remarkStringify from "remark-stringify";
import unified from "unified";
import unist from "unist";
import parents, { NodeWithParent } from "unist-util-parents";
import unistUtilSelect from "unist-util-select";
import { QAPromptNode, qaPromptNodeType } from "./index";

// TODO: don't match QA prompts inside code and html blocks
export default function qaPromptPlugin(this: unified.Processor) {
  const compilerPrototype = this.Compiler.prototype as remarkStringify.Compiler;
  compilerPrototype.visitors[qaPromptNodeType] = qaPromptCompiler as (
    node: unist.Node,
  ) => string;

  return extractQAPromptNodes;
}

function qaPromptCompiler(
  this: remarkStringify.Compiler & {
    all: (node: unist.Node) => string[];
  },
  node: QAPromptNode,
): string {
  throw new Error("Unimplemented");
}

const questionPrefix = "Q. ";
const answerPrefix = "A. ";
const answerSplitRegexp = new RegExp(`\n${answerPrefix}`, "m");

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
      throw new Error(
        `Unexpected QA prompt answer node: ${JSON.stringify(
          answerNode,
          null,
          "\t",
        )}`,
      );
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
            question: questionParagraphNode,
            answer: answerParagraphNode,
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
    if (preSplitString !== "") {
      // We've gotta split that node.
      questionPhrasingNodes.push({
        type: "text",
        value: preSplitString,
      });
      answerPhrasingNodes[0].value = postSplitString;
    }
    (questionPhrasingNodes[0] as mdast.Text).value = (questionPhrasingNodes[0] as mdast.Text).value.slice(
      questionPrefix.length,
    );
    (answerPhrasingNodes[0] as mdast.Text).value = (answerPhrasingNodes[0] as mdast.Text).value.slice(
      answerPrefix.length + 1, // add 1 for the newline
    );

    const qaPromptNode: QAPromptNode = {
      type: qaPromptNodeType,
      question: { type: "paragraph", children: questionPhrasingNodes },
      answer: { type: "paragraph", children: answerPhrasingNodes },
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
