import {
  parseSingleCurlyBraceClozePromptMarkup,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import {
  Ingestible,
  IngestibleItem,
  IngestibleItemIdentifier,
  IngestibleSource,
  IngestibleSourceIdentifier,
} from "@withorbit/ingester";
import { Hasher } from "../../hasher/hasher";
import { InterpretableFile, Interpreter } from "../../interpreter";
import { findAllPrompts, parseMarkdown, processor, Prompt } from "./markdown";
import { getNoteTitle } from "./utils/getNoteTitle";
import { getStableBearID } from "./utils/getStableBearID";

export class BearInterpreter implements Interpreter {
  private _hasher: Hasher;
  constructor(hasher: Hasher) {
    this._hasher = hasher;
  }

  async interpret(files: InterpretableFile[]): Promise<Ingestible> {
    const nullableSources = await Promise.all(
      files.map(async (file): Promise<IngestibleSource | null> => {
        const root = await parseMarkdown(file.content);
        const bearId = getStableBearID(root);

        if (bearId) {
          const prompts = findAllPrompts(root);
          const noteTitle = getNoteTitle(root);

          return {
            identifier: bearId.id as IngestibleSourceIdentifier,
            title: noteTitle ?? file.name,
            url: bearId.openURL,
            items: prompts.map((prompt): IngestibleItem => {
              const spec = convertInterpreterPromptToIngestible(prompt);
              const identifier = this._hasher.hash(
                spec,
              ) as IngestibleItemIdentifier;
              return { identifier, spec };
            }),
          };
        } else {
          return null;
        }
      }),
    );
    const sources = nullableSources.filter(
      (source) => source !== null,
    ) as IngestibleSource[];
    return { sources };
  }
}

function convertInterpreterPromptToIngestible(prompt: Prompt): TaskSpec {
  if (prompt.type === "qaPrompt") {
    return {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.QA,
        body: {
          text: processor.stringify(prompt.question).trimRight(),
          attachments: [],
        },
        answer: {
          text: processor.stringify(prompt.answer).trimRight(),
          attachments: [],
        },
      },
    };
  } else {
    const markdownString = processor.stringify(prompt.block).trimRight();
    const { markupWithoutBraces, clozeComponents } =
      parseSingleCurlyBraceClozePromptMarkup(markdownString);
    return {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: {
          text: markupWithoutBraces,
          attachments: [],
        },
        components: clozeComponents,
      },
    };
  }
}
