import { testBasicPromptSpec } from "metabook-sample-data";
import { CardProps } from "../Card";

const testCardProps: CardProps = {
  promptTask: {
    spec: testBasicPromptSpec,
  },
  promptState: null,
  reviewMarkingInteractionState: null,
  schedule: "aggressiveStart",
  showsNeedsRetryNotice: false,
  shouldLabelApplicationPrompts: true,
  isRevealed: false,
  isOccluded: false,
};
export default testCardProps;
