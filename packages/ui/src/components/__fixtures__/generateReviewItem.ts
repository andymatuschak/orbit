import {
  ColorPaletteName,
  getIDForPromptSync,
  getIDForPromptTask,
  Prompt,
  PromptProvenanceType,
} from "@withorbit/core";
import { testQAPrompt } from "@withorbit/sample-data";
import { ReviewAreaItem } from "../../reviewAreaItem";
import * as styles from "../../styles";

export function generateReviewItem(
  questionText: string,
  answerText: string,
  contextString: string,
  colorPaletteName: ColorPaletteName,
): ReviewAreaItem {
  const prompt: Prompt = {
    ...testQAPrompt,
    question: { contents: questionText, attachments: [] },
    answer: { contents: answerText, attachments: [] },
  };
  return {
    promptTaskID: getIDForPromptTask({
      promptID: getIDForPromptSync(prompt),
      promptType: prompt.promptType,
      promptParameters: null,
    }),
    provenance: {
      provenanceType: PromptProvenanceType.Web,
      externalID: "http://foo.com",
      modificationTimestampMillis: null,
      title: contextString,
      url: "http://foo.com",
      siteName: null,
      colorPaletteName,
    },
    colorPalette: styles.colors.palettes[colorPaletteName],
    taskParameters: null,
    prompt,
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}
