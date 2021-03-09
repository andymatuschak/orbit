import * as IT from "incremental-thinking";
import mdast from "mdast";
import unist from "unist";
import {
  applicationPromptType,
  qaPromptType,
  clozePromptType,
  Prompt,
} from "metabook-core";

export function getOrbitPromptForITPrompt(prompt: IT.Prompt): Prompt {
  function getMarkdownString(block: unist.Node): string {
    return IT.processor.stringify(block).trimRight();
  }
  switch (prompt.type) {
    case IT.qaPromptType:
      return {
        promptType: qaPromptType,
        question: {
          contents: getMarkdownString(prompt.question),
          attachments: [],
        },
        answer: {
          contents: getMarkdownString(prompt.answer),
          attachments: [],
        },
      };
    case IT.clozePromptType:
      return {
        promptType: clozePromptType,
        body: {
          contents: getMarkdownString(prompt.block),
          attachments: [],
        },
      };
  }
}

export function getITPromptForOrbitPrompt(prompt: Prompt): IT.Prompt | null {
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

  switch (prompt.promptType) {
    case qaPromptType:
      const question = getRootChild(prompt.question.contents);
      const answer = getRootChild(prompt.answer.contents);
      if (question && answer) {
        return {
          type: IT.qaPromptType,
          question: question as mdast.Parent & IT.JSONTypes.JsonMap,
          answer: answer as mdast.Parent & IT.JSONTypes.JsonMap,
        };
      } else {
        return null;
      }
    case clozePromptType:
      const clozeBlock = getRootChild(prompt.body.contents);
      if (clozeBlock) {
        return {
          type: IT.clozePromptType,
          block: clozeBlock as mdast.BlockContent & IT.JSONTypes.JsonMap,
        };
      } else {
        return null;
      }
    case applicationPromptType:
      return null;
  }
}
