import {
  ColorPaletteName,
  generateUniqueID,
  mainTaskComponentID,
} from "@withorbit/core";
import { testQASpec } from "@withorbit/sample-data";
import { ReviewAreaItem } from "../../reviewAreaItem.js";
import * as styles from "../../styles/index.js";

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
    },
  };
}
