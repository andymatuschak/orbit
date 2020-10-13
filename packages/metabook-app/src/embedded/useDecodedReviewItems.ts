import { ReviewItem } from "metabook-ui";
import React from "react";
import { EmbeddedItem } from "../../../embedded-support/src/embeddedScreenInterface";
import { getReviewItems } from "./getReviewItems";

// Extracts prompts embedded in the URL and resolves attachments as necessary
export default function useDecodedReviewItems(
  embeddedItems: EmbeddedItem[],
): ReviewItem[] | null {
  const [items, setItems] = React.useState<ReviewItem[] | null>(null);
  React.useEffect(() => {
    getReviewItems(embeddedItems).then(setItems);
  }, [embeddedItems]);
  return items;
}
