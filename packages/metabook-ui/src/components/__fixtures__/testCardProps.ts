import { testBasicPrompt } from "metabook-sample-data";
import { CardProps } from "../Card";

const testCardProps: CardProps = {
  reviewItem: {
    reviewItemType: "prompt",
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
    attachmentResolutionMap: null,
  },
  reviewMarkingInteractionState: null,
  schedule: "aggressiveStart",
  backIsRevealed: false,
  isDisplayed: false,
};
export default testCardProps;
