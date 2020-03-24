import { MetabookActionOutcome } from "metabook-core";

export type ReviewMarkingInteractionState = {
  outcome: MetabookActionOutcome;
  status: "pending" | "committed";
};
export function QPI() {
  return null; // TODO
}
