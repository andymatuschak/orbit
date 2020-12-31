import {
  EmbeddedScreenRecord,
  embeddedScreenRecordUpdateEventName,
} from "metabook-embedded-support";
import { styles } from "metabook-ui";
import React from "react";
import { EmbeddedItem } from "../../../embedded-support/src/embeddedScreenInterface";
import { ReviewItem } from "../model/reviewItem";
import { resolveReviewItems } from "./resolveReviewItems";

function sendResolvedReviewItemsToHost(reviewItems: ReviewItem[]) {
  // Pass the local review reviewItems along to the hosting web page when they change (i.e. so that the starbursts in other review areas on this page reflect this one's prompts).
  const state: EmbeddedScreenRecord = { reviewItems };
  parent.postMessage({ type: embeddedScreenRecordUpdateEventName, state }, "*");
}

// Extracts prompts embedded in the URL and resolves attachments as necessary
export default function useResolvedReviewItems(
  embeddedItems: EmbeddedItem[],
  colorPalette: styles.colors.ColorPalette,
): ReviewItem[] | null {
  const [reviewItems, setReviewItems] = React.useState<ReviewItem[] | null>(
    null,
  );
  React.useEffect(() => {
    resolveReviewItems(embeddedItems).then((reviewItems) => {
      setReviewItems(reviewItems);
      sendResolvedReviewItemsToHost(reviewItems);
    });
  }, [embeddedItems, colorPalette]);
  return reviewItems;
}
