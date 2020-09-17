import { testBasicPrompt } from "metabook-sample-data";
import { CardProps } from "../Card";
import { colors } from "../../styles";

const testCardProps: CardProps = {
  reviewItem: {
    reviewItemType: "prompt",
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
    attachmentResolutionMap: null,
  },
  backIsRevealed: false,
};
export default testCardProps;
