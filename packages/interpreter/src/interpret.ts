import {
  TaskContentType,
  TaskSpecType,
  type ClozeTaskContent,
  type TaskSpec,
} from "@withorbit/core";
import type {
  Ingestible,
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "@withorbit/ingester";
import type { BlockContent, Link, Nodes } from "mdast";
import { hashTaskSpec } from "./hashTaskSpec.js";
import {
  findClozeBlocks,
  getBearID,
  getNoteTitle,
  parseMarkdown,
  sourceRange,
  stringifyMarkdown,
  walkMarkdown,
  withoutBacklinks,
  type SourceRange,
} from "./markdown.js";
import { extractQAPrompts } from "./qa.js";
import {
  stripTaskBadge,
  validateTaskBadges,
  withoutTaskBadges,
} from "./taskBadge.js";

export type MarkdownFile = { name: string; path: string; content: string };

/** Pure Markdown → ingestion input. No file writes, storage, or account state. */
export function interpretMarkdownFiles(
  files: readonly MarkdownFile[],
): Ingestible {
  return { sources: files.map((file) => analyzeMarkdownFile(file).source) };
}

/** Shared interpretation and untouched source spans for source-preserving edits. */
export function analyzeMarkdownFile(file: MarkdownFile): {
  source: IngestibleSource;
  prompts: {
    item: IngestibleItem;
    range: SourceRange;
    separateParagraph: boolean;
  }[];
} {
  const parsed = parseMarkdown(file.content);
  const bearID = getBearID(parsed);
  const root = withoutBacklinks(parsed);
  const { prompts, remaining } = extractQAPrompts(root);
  const acceptedBadges: Link[] = [];
  function item(
    spec: TaskSpec,
    marker: ReturnType<typeof stripTaskBadge>,
    range: SourceRange,
    separateParagraph = false,
  ) {
    if (marker.badge) acceptedBadges.push(marker.badge);
    return {
      range,
      separateParagraph,
      item: {
        identifier: (marker.taskID ??
          hashTaskSpec(spec)) as IngestibleItemIdentifier,
        ...(marker.taskID ? { taskID: marker.taskID } : {}),
        spec,
      },
    };
  }
  const located = [
    // Keep the historical cloze-before-QA order for existing imports.
    ...findClozeBlocks(remaining).map((block) => {
      const marker = stripTaskBadge([block]);
      return item(
        compileCloze(marker.nodes[0] as BlockContent),
        marker,
        sourceRange(block),
      );
    }),
    ...prompts.map(({ question, answer, range }) => {
      const marker = stripTaskBadge(answer);
      return item(
        {
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: stringifyMarkdown(question), attachments: [] },
            answer: {
              text: stringifyMarkdown(marker.nodes),
              attachments: [],
            },
          },
        },
        marker,
        range,
        !endsInInlineContent(answer[answer.length - 1]),
      );
    }),
  ];
  validateTaskBadges(root, acceptedBadges, parsed);
  return {
    prompts: located,
    source: {
      identifier: (bearID ?? file.path) as IngestibleSourceIdentifier,
      title: getNoteTitle(withoutTaskBadges(root, acceptedBadges)) ?? file.name,
      url: bearID ? `bear://x-callback-url/open-note?id=${bearID}` : undefined,
      items: located.map(({ item }) => item),
    },
  };
}

function endsInInlineContent(node: Nodes): boolean {
  if (node.type === "paragraph" || node.type === "heading") return true;
  if (!("children" in node) || !node.children.length) return false;
  return endsInInlineContent(node.children[node.children.length - 1]);
}

function compileCloze(block: BlockContent): TaskSpec {
  // Ranges address canonical Markdown, not the original note. Reparse this one
  // rendered block so escaping, math, links, and UTF-16 offsets stay identical
  // to the strings the review UI will receive.
  const marked = stringifyMarkdown([block]);
  const clozes = [...walkMarkdown(parseMarkdown(marked))].filter(
    (node) => node.type === "cloze",
  );
  const components = new Map<string, ClozeTaskContent["components"][string]>();
  let text = "";
  let cursor = 0;
  for (const [index, cloze] of clozes.entries()) {
    const { start, end } = sourceRange(cloze);
    text += marked.slice(cursor, start);
    const startIndex = text.length;
    const componentID = cloze.componentID ?? index.toString();
    if (components.has(componentID))
      throw new Error(
        `Cloze component ID ${JSON.stringify(componentID)} is used more than once; give each blank a distinct ID`,
      );
    const contentStart =
      start +
      1 +
      (cloze.componentID === undefined ? 0 : componentID.length + 2);
    let content = marked.slice(contentStart, end - 1);
    // This escape exists only to keep the canonical source from reinterpreting
    // a literal ID-like prefix. It was not part of legacy normalized answers.
    if (cloze.componentID === undefined)
      content = content.replace(/^([A-Za-z0-9_-]+)\\::/, "$1::");
    text += content;
    components.set(componentID, {
      order: index,
      ranges: [{ hint: null, startIndex, length: content.length }],
    });
    cursor = end;
  }
  text += marked.slice(cursor);
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text, attachments: [] },
      components: Object.fromEntries(components),
    },
  };
}
