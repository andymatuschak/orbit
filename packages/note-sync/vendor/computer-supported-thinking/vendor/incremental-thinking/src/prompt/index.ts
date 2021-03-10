import unist from "unist";
import mdast from "mdast";
import parents, { NodeWithParent } from "unist-util-parents";
import unistUtilSelect from "unist-util-select";
import { backlinksNodeType } from "../backlinksPlugin";
import { JsonMap } from "../util/JSONTypes";

export const clozeNodeType = "incremental-thinking-cloze";
export interface ClozePromptNode extends unist.Node {
  type: typeof clozeNodeType;
  children: mdast.PhrasingContent[];
}

export const clozePromptType = "cloze";
export interface ClozePrompt extends JsonMap {
  type: typeof clozePromptType;
  block: mdast.BlockContent & JsonMap; // Except note that PhrasingContent can include type ClozePromptNode.
}

export const qaPromptNodeType = "incremental-thinking-QA";
export interface QAPromptNode extends unist.Node {
  type: typeof qaPromptNodeType;
  question: mdast.Parent;
  answer: mdast.Parent;
}

export const qaPromptType = "qaPrompt";
export interface QAPrompt extends JsonMap {
  type: typeof qaPromptType;
  question: mdast.Parent & JsonMap;
  answer: mdast.Parent & JsonMap;
}

export type Prompt = ClozePrompt | QAPrompt;

export function findAllPrompts(tree: unist.Node): Prompt[] {
  const treeWithParents = parents(tree);
  const clozeNodes = unistUtilSelect.selectAll(
    clozeNodeType,
    treeWithParents,
  ) as NodeWithParent[];

  const clozePrompts: ClozePrompt[] = [];
  const visitedClozePromptBlocks: Set<mdast.BlockContent> = new Set();
  for (const node of clozeNodes) {
    let parent: NodeWithParent | null = node.parent;
    while (parent && !isBlockContent(parent)) {
      parent = parent.parent;
    }

    if (
      parent &&
      !promptNodeHasUnsupportedParent(node) &&
      !visitedClozePromptBlocks.has(parent)
    ) {
      visitedClozePromptBlocks.add(parent);
      clozePrompts.push({
        type: "cloze",
        block: parent as mdast.BlockContent & JsonMap,
      });
    }
  }

  const qaPrompts = unistUtilSelect
    .selectAll(qaPromptNodeType, treeWithParents)
    .filter((n) => !promptNodeHasUnsupportedParent(n as NodeWithParent))
    .map((n) => {
      const qaPromptNode = n as QAPromptNode;
      const qaPrompt: QAPrompt = {
        type: "qaPrompt",
        question: qaPromptNode.question as mdast.Parent & JsonMap,
        answer: qaPromptNode.answer as mdast.Parent & JsonMap,
      };
      return qaPrompt;
    });

  return (clozePrompts as Prompt[]).concat(qaPrompts);
}

export function getClozeNodesInClozePrompt(
  clozePrompt: ClozePrompt,
): ClozePromptNode[] {
  return unistUtilSelect.selectAll(
    clozeNodeType,
    clozePrompt.block,
  ) as ClozePromptNode[];
}

function promptNodeHasUnsupportedParent(promptNode: NodeWithParent): boolean {
  let node = promptNode.parent;
  while (node) {
    if (node.type === backlinksNodeType) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

const blockTypes = new Set([
  "paragraph",
  "heading",
  "thematicBreak",
  "blockquote",
  "list",
  "table",
  "html",
  "code",
]);

function isBlockContent(node: unist.Node): node is mdast.BlockContent {
  return blockTypes.has(node.type);
}
