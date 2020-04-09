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
  showsNeedsRetryNotice: false,
  shouldLabelApplicationPrompts: true,
  isRevealed: false,
  isOccluded: false,
};
export default testCardProps;
