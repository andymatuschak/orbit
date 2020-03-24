import { testBasicPromptData } from "metabook-sample-data";
import { CardProps } from "../Card";

const testCardProps: CardProps = {
  promptType: testBasicPromptData.cardType,
  questionAnswerData: testBasicPromptData,
  cardState: null,
  reviewMarkingInteractionState: null,
  schedule: "aggressiveStart",
  showsNeedsRetryNotice: false,
  shouldLabelApplicationPrompts: true,
  isRevealed: false,
  isOccluded: false,
};
export default testCardProps;
