import mdast from "mdast";
import { headingRange } from "mdast-util-heading-range";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkWikiLink from "remark-wiki-link";
import remarkFrontmatter from "remark-frontmatter";
import { unified } from "unified";
import unist from "unist";
import { parents } from "unist-util-parents";
import { selectAll } from "unist-util-select";
import bearIDPlugin from "./plugins/bearIDPlugin.js";
import clozePromptPlugin from "./plugins/clozePromptPlugin.js";
import qaPromptPlugin from "./plugins/qaPromptPlugin.js";

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
  question: mdast.RootContent & JsonMap;
  answer: mdast.RootContent & JsonMap;
}

export type Prompt = ClozePrompt | QAPrompt;

export const clozeNodeType = "clozePromptNode";
export interface ClozePromptNode extends unist.Node {
  type: typeof clozeNodeType;
  children: mdast.PhrasingContent[];
}

export const qaPromptNodeType = "qaPrompt";
export interface QAPromptNode extends unist.Node {
  type: typeof qaPromptNodeType;
  question: mdast.RootContent;
  answer: mdast.RootContent;
}

type NodeWithParent = mdast.Nodes & {
  parent?: NodeWithParent;
};

export const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkStringify, {
    bullet: "*",
    emphasis: "*",
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  })
  .use(remarkFrontmatter)
  .use(remarkMath);

export const processor = markdownProcessor()
  .use(remarkWikiLink)
  .use(bearIDPlugin)
  .use(clozePromptPlugin)
  .use(qaPromptPlugin);

export async function parseMarkdown(content: string) {
  const root = await processor.run(processor.parse(content));
  return root as mdast.Root;
}

export function findAllPrompts(tree: mdast.Root): Prompt[] {
  // Strip backlinks section out of tree. (headingRange mutates in-place)
  headingRange(tree, "Backlinks", () => []);
  const treeWithParents = parents(tree) as NodeWithParent;
  const clozeNodes = selectAll(
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

    if (parent && !visitedClozePromptBlocks.has(parent)) {
      visitedClozePromptBlocks.add(parent);
      clozePrompts.push({
        type: "cloze",
        block: parent as mdast.BlockContent & JsonMap,
      });
    }
  }

  const qaPrompts = selectAll(qaPromptNodeType, treeWithParents).map((n) => {
    const qaPromptNode = n as QAPromptNode;
    const qaPrompt: QAPrompt = {
      type: "qaPrompt",
      question: qaPromptNode.question as mdast.RootContent & JsonMap,
      answer: qaPromptNode.answer as mdast.RootContent & JsonMap,
    };
    return qaPrompt;
  });

  return (clozePrompts as Prompt[]).concat(qaPrompts);
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
