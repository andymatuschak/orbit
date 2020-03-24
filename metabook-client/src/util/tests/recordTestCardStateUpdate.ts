import { CardState } from "metabook-core";
import { MetabookUserClient } from "../../userClient/userClient";

export function recordTestCardStateUpdate(
  client: MetabookUserClient,
  promptID: string,
): { newCardState: CardState; commit: Promise<unknown> } {
  return client.recordCardStateUpdate({
    promptID,
    promptType: "basic",
    baseCardState: null,
    actionOutcome: "remembered",
    sessionID: "a",
    timestamp: 1000,
  });
}
