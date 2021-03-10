import { testQAPrompt } from "@withorbit/sample-data";
import { CardProps } from "../Card";
import { colors } from "../../styles";

const testCardProps: CardProps = {
  reviewItem: {
    prompt: testQAPrompt,
    promptParameters: null,
    taskParameters: null,
    colorPalette: colors.palettes.red,
    provenance: null,
    attachmentResolutionMap: null,
  },
  backIsRevealed: false,
};
export default testCardProps;
