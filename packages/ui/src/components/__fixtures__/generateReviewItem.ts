import {
  ColorPaletteName,
  generateUniqueID,
  mainTaskComponentID,
} from "@withorbit/core";
import { testQASpec } from "@withorbit/sample-data";
import { ReviewAreaItem } from "../../reviewAreaItem";
import * as styles from "../../styles";

export function generateReviewItem(
  questionText: string,
  answerText: string,
  contextString: string,
  colorPaletteName: ColorPaletteName,
): ReviewAreaItem {
  return {
    taskID: generateUniqueID(),
    colorPalette: styles.colors.palettes[colorPaletteName],
    provenance: {
      identifier: "Web",
      title: contextString,
      url: "http://foo.com",
    },
    componentID: mainTaskComponentID,
    spec: {
      ...testQASpec,
      content: {
        ...testQASpec.content,
        body: {
          ...testQASpec.content.body,
          text: questionText,
        },
        answer: {
          ...testQASpec.content.answer,
          text: answerText,
        }
      }
    },
  };
}
