import { testBasicPromptSpec } from "metabook-sample-data";
import { CardProps } from "../Card";

const testCardProps: CardProps = {
  reviewItem: {
    reviewItemType: "prompt",
    promptSpec: testBasicPromptSpec,
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
