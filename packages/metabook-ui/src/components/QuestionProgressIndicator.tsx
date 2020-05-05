import { PromptRepetitionOutcome } from "metabook-core";

export type ReviewMarkingInteractionState = {
  outcome: PromptRepetitionOutcome;
  status: "pending" | "committed";
};
export function QPI() {
  return null; // TODO
}
