import { ReviewItem } from "@withorbit/core";

export function findItemsToRetry(
  sessionItems: ReviewItem[],
  // hostState: EmbeddedHostState,
): ReviewItem[] {
  return sessionItems.filter((item) => {
    const componentState = item.task.componentStates[item.componentID];
    return (
      componentState.lastRepetitionTimestampMillis !== null &&
      componentState.intervalMillis === 0
    );
  });
}
