import {
  ClozeTaskContent,
  parseSingleCurlyBraceClozePromptMarkup,
  TaskContent,
  TaskContentType,
  TaskSpec,
  TaskSpecType,
} from "@withorbit/core";
import * as IT from "incremental-thinking";
import mdast from "mdast";
import unist from "unist";

export function getOrbitTaskSpecForITPrompt(prompt: IT.Prompt): TaskSpec {
  function getMarkdownString(block: unist.Node): string {
    return IT.processor.stringify(block).trimRight();
  }
  let content: TaskContent;
  switch (prompt.type) {
    case IT.qaPromptType:
      content = {
        type: TaskContentType.QA,
        body: {
          text: getMarkdownString(prompt.question),
          attachments: [],
        },
        answer: {
          text: getMarkdownString(prompt.answer),
          attachments: [],
        },
      };
      break;
    case IT.clozePromptType:
      const { markupWithoutBraces, clozeComponents } =
        parseSingleCurlyBraceClozePromptMarkup(getMarkdownString(prompt.block));
      content = {
        type: TaskContentType.Cloze,
        body: {
          text: markupWithoutBraces,
          attachments: [],
        },
        components: clozeComponents,
      };
      break;
  }
  return {
    type: TaskSpecType.Memory,
    content,
  };
}

export function getITPromptForOrbitTaskSpec(spec: TaskSpec): IT.Prompt | null {
  function getRootChild(markdown: string): mdast.Content | null {
    const ast = IT.processor.runSync(
      IT.processor.parse(markdown),
    ) as mdast.Root;
    if (ast.type !== "root") {
      throw new Error(
        `Markdown somehow parsed to something other than a root node: ${markdown}`,
      );
    }
    if (ast.children.length !== 1) {
      console.log(
        `Prompt markdown has multiple (or zero) root children, which shouldn't happen: ${markdown}`,
      );
      return null;
    }
    return ast.children[0];
  }

  switch (spec.content.type) {
    case TaskContentType.QA:
      const question = getRootChild(spec.content.body.text);
      const answer = getRootChild(spec.content.answer.text);
      if (question && answer) {
        return {
          type: IT.qaPromptType,
          question: question as mdast.Parent & IT.JSONTypes.JsonMap,
          answer: answer as mdast.Parent & IT.JSONTypes.JsonMap,
        };
      } else {
        return null;
      }
    case TaskContentType.Cloze:
      function backportClozePromptContents(content: ClozeTaskContent): string {
        const ranges = Object.values(content.components)
          .sort((a, b) => a.order - b.order)
          .map((component) => {
            if (component.ranges.length !== 1) {
              throw new Error(
                `Multiple ranges not supported in cloze content backport ${JSON.stringify(
                  content,
                  null,
                  "\t",
                )}`,
              );
            }

            return component.ranges[0];
          });

        const clozeText = content.body.text;
        let output = "";
        let lastIndex = 0;
        for (const range of ranges) {
          output += clozeText.slice(lastIndex, range.startIndex);
          output += `{${clozeText.substr(range.startIndex, range.length)}}`;
          lastIndex = range.startIndex + range.length;
        }
        output += clozeText.slice(lastIndex);
        return output;
      }

      const clozeBlock = getRootChild(
        backportClozePromptContents(spec.content),
      );
      if (clozeBlock) {
        return {
          type: IT.clozePromptType,
          block: clozeBlock as mdast.BlockContent & IT.JSONTypes.JsonMap,
        };
      } else {
        return null;
      }
    case TaskContentType.Plain:
      return null;
  }
}
