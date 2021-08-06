import { getIDForPromptSync, getIDForPromptTask } from "@withorbit/core";
import { testQAPrompt } from "@withorbit/sample-data";
import { CardProps } from "../Card";
import { colors } from "../../styles";

const testCardProps: CardProps = {
  reviewItem: {
    promptTaskID: getIDForPromptTask({
      promptID: getIDForPromptSync(testQAPrompt),
      promptType: testQAPrompt.promptType,
      promptParameters: null,
    }),
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
