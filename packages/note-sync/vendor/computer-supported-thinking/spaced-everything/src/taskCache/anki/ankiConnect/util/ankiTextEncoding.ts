import { clozeNodeType, ClozePrompt, processor } from "incremental-thinking";
import mdast from "mdast";
import remarkStringify from "remark-stringify";
import stripMarkdown from "strip-markdown";
import unified from "unified";
import unist from "unist";
import { JsonMap } from "../../../../util/JSONTypes";
import {
  decodeTaskIDPath,
  EncodedTaskIDPath,
  encodeTaskIDPath,
  TaskIDPath,
} from "../../../taskCache";
import { AnkiPathField } from "../../dataModel";

function ankiClozePlugin(this: unified.Processor) {
  this.Compiler.prototype.ankiClozeIndex = 1;
  this.Compiler.prototype.visitors[clozeNodeType] = function (
    this: remarkStringify.Compiler & {
      ankiClozeIndex: number;
      all: (node: unist.Node) => string[];
    },
    node: unist.Node
  ) {
    const interiorContent = this.all(node).join("");
    const output = `{{c${this.ankiClozeIndex}::${interiorContent}}}`;
    this.ankiClozeIndex++;
    return output;
  } as (node: unist.Node) => string;
}

export function createAnkiTextFromClozePrompt(prompt: ClozePrompt): string {
  const ankiProcessor = processor().use(ankiClozePlugin).use(stripMarkdown);
  const strippedTree = ankiProcessor.runSync(prompt.block);
  return ankiProcessor.stringify(strippedTree);
}

export function createClozePromptFromAnkiOriginalMarkdownField(
  originalMarkdown: string
): ClozePrompt {
  const ast = processor.parse(originalMarkdown);
  const resultingNode = processor.runSync(ast) as mdast.Root;
  if (resultingNode.children.length !== 1) {
    throw new Error(
      `Anki note text has no Markdown content: ${originalMarkdown}`
    );
  }
  return {
    type: "cloze",
    block: resultingNode.children[0] as mdast.BlockContent & JsonMap,
  };
}

export function encodeTaskIDPathToAnkiPathField(
  taskIDPath: TaskIDPath
): AnkiPathField {
  return Buffer.from(encodeTaskIDPath(taskIDPath)).toString(
    "base64"
  ) as AnkiPathField;
}

export function decodeAnkiPathFieldToTaskIDPath(
  ankiPathField: AnkiPathField
): TaskIDPath {
  return decodeTaskIDPath(
    Buffer.from(ankiPathField, "base64").toString("ascii") as EncodedTaskIDPath
  );
}
