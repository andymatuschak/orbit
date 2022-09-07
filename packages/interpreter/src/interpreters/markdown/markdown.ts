import unist from "unist";
import mdast from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { parents } from "unist-util-parents";
import * as unistUtilSelect from "unist-util-select";
import noteLinkProcessorPlugin from "./plugins/noteLinkProcessorPlugin";
import backlinksPlugin from "./plugins/backlinksPlugin";
import bearIDPlugin from "./plugins/bearIDPlugin";
import clozePromptPlugin from "./plugins/clozePromptPlugin";
import qaPromptPlugin from "./plugins/qaPromptPlugin";

export type JsonArray = Array<AnyJson>;
export type AnyJson = boolean | number | string | null | JsonArray | JsonMap;
export interface JsonMap {
  [key: string]: AnyJson;
}

export const clozePromptType = "cloze";
export interface ClozePrompt extends JsonMap {
  type: typeof clozePromptType;
  block: mdast.BlockContent & JsonMap; // Except note that PhrasingContent can include type ClozePromptNode.
}

export const qaPromptType = "qaPrompt";
export interface QAPrompt extends JsonMap {
  type: typeof qaPromptType;
  question: mdast.Parent & JsonMap;
  answer: mdast.Parent & JsonMap;
}

export type Prompt = ClozePrompt | QAPrompt;

const backlinksNodeType = "backlinksNode";

export const clozeNodeType = "incremental-thinking-cloze";
export interface ClozePromptNode extends unist.Node {
  type: typeof clozeNodeType;
  children: mdast.PhrasingContent[];
}

export const qaPromptNodeType = "incremental-thinking-QA";
export interface QAPromptNode extends unist.Node {
  type: typeof qaPromptNodeType;
  question: mdast.Parent;
  answer: mdast.Parent;
}

type NodeWithParent = unist.Node & {
  parent?: NodeWithParent;
};

export const markdownProcessor = unified()
  .use(remarkParse as any)
  // @ts-ignore
  .use(remarkStringify, {
    bullet: "*",
    emphasis: "*",
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  });

export const processor = markdownProcessor()
  .use(noteLinkProcessorPlugin)
  .use(backlinksPlugin)
  .use(bearIDPlugin)
  .use(clozePromptPlugin)
  .use(qaPromptPlugin);

export async function parseMarkdown(content: string) {
  const root = await processor.run(processor.parse(content));
  return root as mdast.Root;
}

export function findAllPrompts(tree: unist.Node): Prompt[] {
  const treeWithParents = parents(tree) as NodeWithParent;
  const clozeNodes = unistUtilSelect.selectAll(
    clozeNodeType,
    treeWithParents,
  ) as NodeWithParent[];

  const clozePrompts: ClozePrompt[] = [];
  const visitedClozePromptBlocks: Set<mdast.BlockContent> = new Set();
  for (const node of clozeNodes) {
    let parent = node.parent;
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
    .filter((n) => !promptNodeHasUnsupportedParent(n))
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

function promptNodeHasUnsupportedParent(promptNode: unist.Node): boolean {
  let node = (promptNode as NodeWithParent).parent;
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
