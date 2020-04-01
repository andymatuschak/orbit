import { basicPromptSpecType, getIDForPromptSpec } from "metabook-core";
import { testBasicPromptSpec } from "metabook-sample-data";
import { CardProps } from "../Card";

const testCardProps: CardProps = {
  reviewItem: {
    reviewItemType: "prompt",
    promptSpec: testBasicPromptSpec,
    promptParameters: null,
    promptState: null,
  },
  reviewMarkingInteractionState: null,
  schedule: "aggressiveStart",
  showsNeedsRetryNotice: false,
  shouldLabelApplicationPrompts: true,
  isRevealed: false,
  isOccluded: false,
};
export default testCardProps;
