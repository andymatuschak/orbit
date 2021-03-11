import { ColorPaletteName, PromptProvenanceType } from "@withorbit/core";
import { testQAPrompt } from "@withorbit/sample-data";
import { ReviewAreaItem } from "../../reviewAreaItem";
import * as styles from "../../styles";

export function generateReviewItem(
  questionText: string,
  answerText: string,
  contextString: string,
  colorPaletteName: ColorPaletteName,
): ReviewAreaItem {
  return {
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
    prompt: {
      ...testQAPrompt,
      question: { contents: questionText, attachments: [] },
      answer: { contents: answerText, attachments: [] },
    },
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}
