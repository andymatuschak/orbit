import { testQAPrompt } from "metabook-sample-data";
import { CardProps } from "../Card";
import { colors } from "../../styles";

const testCardProps: CardProps = {
  reviewItem: {
    reviewItemType: "prompt",
    prompt: testQAPrompt,
    promptParameters: null,
    promptState: null,
    attachmentResolutionMap: null,
  },
  backIsRevealed: false,
};
export default testCardProps;
