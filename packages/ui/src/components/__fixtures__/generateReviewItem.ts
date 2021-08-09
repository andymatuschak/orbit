import { ColorPaletteName, mainTaskComponentID } from "@withorbit/core2";
import { testQASpec } from "@withorbit/sample-data/src/core2";
import { ReviewAreaItem } from "../../reviewAreaItem";
import * as styles from "../../styles";

export function generateReviewItem(
  questionText: string,
  answerText: string,
  contextString: string,
  colorPaletteName: ColorPaletteName,
): ReviewAreaItem {
  return {
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
    },
  };
}
