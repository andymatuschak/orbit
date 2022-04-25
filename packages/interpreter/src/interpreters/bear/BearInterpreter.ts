import {
  Ingestible,
  IngestiblePrompt,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "@withorbit/ingester";
import { InterpretableFile, Interpreter } from "../../interpreter";
import { findAllPrompts, parseMarkdown, processor, Prompt } from "./markdown";
import { getNoteTitle } from "./utils/getNoteTitle";
import { getStableBearID } from "./utils/getStableBearID";

export class BearInterpreter implements Interpreter {
  async interpret(files: InterpretableFile[]): Promise<Ingestible> {
    const sources = await Promise.all(
      files.map(async (file): Promise<IngestibleSource> => {
        const root = await parseMarkdown(file.content);
        const prompts = findAllPrompts(root);
        const bearId = getStableBearID(root);
        const noteTitle = getNoteTitle(root);

        return {
          identifier: (bearId?.id ?? file.path) as IngestibleSourceIdentifier,
          title: noteTitle ?? file.name,
          prompts: prompts.map(convertInterpreterPromptToIngestable),
        };
      }),
    );
    return { sources };
  }
}

function convertInterpreterPromptToIngestable(
  prompt: Prompt,
): IngestiblePrompt {
  if (prompt.type === "qaPrompt") {
    return {
      type: "qa",
      body: {
        // @ts-expect-error typings are wrong on this function
        text: processor.stringify(prompt.question).trimRight(),
      },
      answer: {
        // @ts-expect-error typings are wrong on this function
        text: processor.stringify(prompt.answer).trimRight(),
      },
    };
  }
  throw new Error(`unsupported prompt type: ${prompt.type}`);
}
