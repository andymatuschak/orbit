import { clozeNodeType, ClozePrompt, processor } from "incremental-thinking";
import { ClozePromptNode } from "incremental-thinking/dist/prompt";
import mdast from "mdast";
import stripMarkdown from "strip-markdown";
import unified from "unified";
import { JsonMap } from "../../../../util/JSONTypes";
import {
  decodeTaskIDPath,
  EncodedTaskIDPath,
  encodeTaskIDPath,
  TaskIDPath,
} from "../../../taskCache";
import { AnkiPathField } from "../../dataModel";

function ankiClozePlugin(this: unified.Processor) {
  let ankiClozeIndex = 1;
  const data = this.data();
  if (!data.toMarkdownExtensions) {
    data.toMarkdownExtensions = [];
  }
  (data.toMarkdownExtensions as any[]).push({
    handlers: {
      [clozeNodeType]: (node: ClozePromptNode) => {
        const index = node.data?.ankiClozeIndex ?? ankiClozeIndex;
        if (node.data?.ankiClozeIndex === undefined) {
          ankiClozeIndex++;
        }
        node.data = node.data ? {...node.data, ankiClozeIndex: index} : {ankiClozeIndex: index};
        const interiorContent = processor
          .stringify({ ...node, type: "emphasis" })
          .slice(1, -2);
        return `{{c${index}::${interiorContent}}}`;
      },
    },
  });
}

export function createAnkiTextFromClozePrompt(prompt: ClozePrompt): string {
  const ankiProcessor = processor().use(ankiClozePlugin).use(stripMarkdown);
  const strippedTree = ankiProcessor.runSync(prompt.block);
  return ankiProcessor.stringify(strippedTree).trimRight();
}

export function createClozePromptFromAnkiOriginalMarkdownField(
  originalMarkdown: string,
): ClozePrompt {
  const ast = processor.parse(originalMarkdown);
  const resultingNode = processor.runSync(ast) as mdast.Root;
  if (resultingNode.children.length !== 1) {
    throw new Error(
      `Anki note text has no Markdown content: ${originalMarkdown}`,
    );
  }
  return {
    type: "cloze",
    block: resultingNode.children[0] as mdast.BlockContent & JsonMap,
  };
}

export function encodeTaskIDPathToAnkiPathField(
  taskIDPath: TaskIDPath,
): AnkiPathField {
  return Buffer.from(encodeTaskIDPath(taskIDPath)).toString(
    "base64",
  ) as AnkiPathField;
}

export function decodeAnkiPathFieldToTaskIDPath(
  ankiPathField: AnkiPathField,
): TaskIDPath {
  return decodeTaskIDPath(
    Buffer.from(ankiPathField, "base64").toString("ascii") as EncodedTaskIDPath,
  );
}
