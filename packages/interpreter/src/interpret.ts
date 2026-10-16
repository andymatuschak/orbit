import {
  TaskContentType,
  TaskSpecType,
  type ClozeTaskContent,
  type TaskSpec,
} from "@withorbit/core";
import type {
  Ingestible,
  IngestibleItemIdentifier,
  IngestibleSourceIdentifier,
} from "@withorbit/ingester";
import type { BlockContent } from "mdast";
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
} from "./markdown.js";
import { extractQAPrompts } from "./qa.js";

export type MarkdownFile = { name: string; path: string; content: string };

/** Pure Markdown → ingestion input. No file writes, storage, or account state. */
export function interpretMarkdownFiles(
  files: readonly MarkdownFile[],
): Ingestible {
  return {
    sources: files.map((file) => {
      const parsed = parseMarkdown(file.content);
      const bearID = getBearID(parsed);
      const root = withoutBacklinks(parsed);
      const { prompts, remaining } = extractQAPrompts(root);
      const specs: TaskSpec[] = [
        // Keep the historical cloze-before-QA order for existing imports.
        ...findClozeBlocks(remaining).map(compileCloze),
        ...prompts.map(({ question, answer }): TaskSpec => ({
          type: TaskSpecType.Memory,
          content: {
            type: TaskContentType.QA,
            body: { text: stringifyMarkdown(question), attachments: [] },
            answer: { text: stringifyMarkdown(answer), attachments: [] },
          },
        })),
      ];
      return {
        identifier: (bearID ?? file.path) as IngestibleSourceIdentifier,
        title: getNoteTitle(root) ?? file.name,
        url: bearID
          ? `bear://x-callback-url/open-note?id=${bearID}`
          : undefined,
        items: specs.map((spec) => ({
          identifier: hashTaskSpec(spec) as IngestibleItemIdentifier,
          spec,
        })),
      };
    }),
  };
}

function compileCloze(block: BlockContent): TaskSpec {
  // Ranges address canonical Markdown, not the original note. Reparse this one
  // rendered block so escaping, math, links, and UTF-16 offsets stay identical
  // to the strings the review UI will receive.
  const marked = stringifyMarkdown([block]);
  const clozes = [...walkMarkdown(parseMarkdown(marked))].filter(
    (node) => node.type === "cloze",
  );
  const components: ClozeTaskContent["components"] = {};
  let text = "";
  let cursor = 0;
  for (const [index, cloze] of clozes.entries()) {
    const { start, end } = sourceRange(cloze);
    text += marked.slice(cursor, start);
    const startIndex = text.length;
    text += marked.slice(start + 1, end - 1);
    components[index.toString()] = {
      order: index,
      ranges: [{ hint: null, startIndex, length: end - start - 2 }],
    };
    cursor = end;
  }
  text += marked.slice(cursor);
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text, attachments: [] },
      components,
    },
  };
}
