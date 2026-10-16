import type { BlockContent, Nodes, Root, RootContent } from "mdast";
import remarkFrontmatter from "remark-frontmatter";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import remarkWikiLink from "remark-wiki-link";
import { unified } from "unified";
import { clozeSyntax } from "./clozeSyntax.js";

// These formatting choices are part of ingestion identity: changing normalized
// Markdown changes existing content hashes, not merely their presentation.
const markdown = unified()
  .use(remarkParse)
  .use(remarkStringify, {
    bullet: "*",
    emphasis: "*",
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  })
  .use(remarkFrontmatter)
  .use(remarkMath)
  .use(remarkWikiLink)
  .use(clozeSyntax);

export type SourceRange = { start: number; end: number };

export function parseMarkdown(source: string): Root {
  return markdown.parse(source);
}

export function stringifyMarkdown(nodes: readonly RootContent[]): string {
  return markdown.stringify({ type: "root", children: [...nodes] }).trimEnd();
}

export function sourceRange(first: Nodes, last = first): SourceRange {
  const start = first.position?.start.offset;
  const end = last.position?.end.offset;
  if (start === undefined || end === undefined)
    throw new Error("Expected source positions from the Markdown parser");
  return { start, end };
}

export function* walkMarkdown(node: Nodes): Generator<Nodes> {
  yield node;
  if ("children" in node)
    for (const child of node.children) yield* walkMarkdown(child);
}

export function getNoteTitle(root: Root): string | null {
  const first = root.children.find((node) => node.type !== "yaml");
  if (!first) return null;
  return stringifyMarkdown(first.type === "heading" ? first.children : [first]);
}

export function getBearID(root: Root): string | undefined {
  const ids: string[] = [];
  for (const node of walkMarkdown(root)) {
    if (node.type !== "html") continue;
    const match = /<!-- \{BearID:([0-9A-F-]+?)\} -->/.exec(node.value);
    if (match) ids.push(match[1]);
  }
  // Ambiguous source identity falls back to the input file path, as before.
  return ids.length === 1 ? ids[0] : undefined;
}

/** Exclude generated backlink sections without changing the parsed document. */
export function withoutBacklinks(root: Root): Root {
  let skippedDepth: number | undefined;
  return {
    ...root,
    children: root.children.filter((node) => {
      if (node.type === "heading") {
        if (skippedDepth !== undefined && node.depth <= skippedDepth)
          skippedDepth = undefined;
        if (/^backlinks$/i.test(plainText(node))) skippedDepth = node.depth;
      }
      return skippedDepth === undefined;
    }),
  };
}

function plainText(node: Nodes): string {
  if ("value" in node) return node.value;
  if ("alt" in node) return node.alt ?? "";
  return "children" in node ? node.children.map(plainText).join("") : "";
}

/** Group each cloze with its nearest block, including paragraphs inside lists. */
export function findClozeBlocks(root: Root): BlockContent[] {
  const blocks = new Set<BlockContent>();
  function visit(node: Nodes, block?: BlockContent) {
    if (isBlock(node)) block = node;
    if (node.type === "cloze" && block) blocks.add(block);
    if ("children" in node)
      for (const child of node.children) visit(child, block);
  }
  visit(root);
  return [...blocks];
}

function isBlock(node: Nodes): node is BlockContent {
  switch (node.type) {
    case "paragraph":
    case "heading":
    case "thematicBreak":
    case "blockquote":
    case "list":
    case "table":
    case "html":
    case "code":
      return true;
    default:
      return false;
  }
}
