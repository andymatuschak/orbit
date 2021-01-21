import {
  EmbeddedItem,
  EmbeddedScreenEventType,
  EmbeddedScreenRecord,
  EmbeddedScreenRecordResolvedEvent,
  ReviewItem,
} from "metabook-embedded-support";
import React from "react";
import { resolveReviewItems } from "./resolveReviewItems";

function sendResolvedReviewItemsToHost(reviewItems: ReviewItem[]) {
  // Pass the local review reviewItems along to the hosting web page when they change (i.e. so that the starbursts in other review areas on this page reflect this one's prompts).
  const record: EmbeddedScreenRecord = { reviewItems };
  const event: EmbeddedScreenRecordResolvedEvent = {
    type: EmbeddedScreenEventType.ScreenRecordResolved,
    record,
  };
  parent.postMessage(event, "*");
}

// Extracts prompts embedded in the URL and resolves attachments as necessary
export default function useResolvedReviewItems(
  embeddedItems: EmbeddedItem[],
): ReviewItem[] | null {
  const [reviewItems, setReviewItems] = React.useState<ReviewItem[] | null>(
    null,
  );
  React.useEffect(() => {
    resolveReviewItems(embeddedItems).then((reviewItems) => {
      setReviewItems(reviewItems);
      sendResolvedReviewItemsToHost(reviewItems);
    });
  }, [embeddedItems]);
  return reviewItems;
}
