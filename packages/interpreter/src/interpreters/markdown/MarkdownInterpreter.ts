import {
  ClozeTaskContentComponent,
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
import mdast, * as Mdast from "mdast";
import { selectAll } from "unist-util-select";
import { Hasher } from "../../hasher/hasher.js";
import { InterpretableFile, Interpreter } from "../../interpreter.js";
import {
  clozeNodeType,
  findAllPrompts,
  parseMarkdown,
  processor,
  Prompt,
} from "./markdown.js";
import { getNoteTitle } from "./utils/getNoteTitle.js";
import { getStableBearID } from "./utils/getStableBearID.js";

export class MarkdownInterpreter implements Interpreter {
  private _hasher: Hasher;
  constructor(hasher: Hasher) {
    this._hasher = hasher;
  }

  async interpret(files: InterpretableFile[]): Promise<Ingestible> {
    const nullableSources = await Promise.all(
      files.map(async (file): Promise<IngestibleSource | null> => {
        const root = await parseMarkdown(file.content);
        const bearId = getStableBearID(root);

        let identifier: IngestibleSourceIdentifier;
        let url: string | undefined;
        if (bearId) {
          identifier = bearId.id as IngestibleSourceIdentifier;
          url = bearId.openURL;
        } else {
          identifier = file.path as IngestibleSourceIdentifier;
        }

        const prompts = findAllPrompts(root);
        const noteTitle = getNoteTitle(root);

        return {
          identifier,
          title: noteTitle ?? file.name,
          url,
          items: prompts.map((prompt): IngestibleItem => {
            const spec = convertInterpreterPromptToIngestible(prompt);
            const identifier = this._hasher.hash(
              spec,
            ) as IngestibleItemIdentifier;
            return { identifier, spec };
          }),
        };
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
          text: processor
            .stringify(prompt.question as unknown as mdast.Root)
            .trimEnd(),
          attachments: [],
        },
        answer: {
          text: processor
            .stringify(prompt.answer as unknown as mdast.Root)
            .trimEnd(),
          attachments: [],
        },
      },
    };
  } else {
    // We've got to strip the braces out of the clozes.
    const markupWithBraces = processor
      .stringify(prompt.block as unknown as Mdast.Root)
      .trimEnd();
    const ast = processor.parse(markupWithBraces);
    const clozes = selectAll(clozeNodeType, ast);
    let markupWithoutBraces = "";
    const components: { [componentID: string]: ClozeTaskContentComponent } = {};
    clozes.forEach((cloze, i) => {
      if (i === 0) {
        markupWithoutBraces += markupWithBraces.slice(
          0,
          clozes[0].position!.start.offset!,
        );
      } else {
        markupWithoutBraces += markupWithBraces.slice(
          clozes[i - 1].position!.end.offset!,
          cloze.position!.start.offset!,
        );
      }
      markupWithoutBraces += markupWithBraces.slice(
        cloze.position!.start.offset! + 1,
        cloze.position!.end.offset! - 1,
      );
      components[i.toString()] = {
        order: i,
        ranges: [
          {
            hint: null,
            startIndex: cloze.position!.start.offset! - i * 2,
            length:
              cloze.position!.end.offset! - cloze.position!.start.offset! - 2,
          },
        ],
      };
    });
    markupWithoutBraces += markupWithBraces.slice(
      clozes.at(-1)!.position!.end.offset!,
    );

    return {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: {
          text: markupWithoutBraces,
          attachments: [],
        },
        components,
      },
    };
  }
}
