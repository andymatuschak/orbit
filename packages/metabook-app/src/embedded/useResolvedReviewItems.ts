import { ReviewItem } from "metabook-ui";
import React from "react";
import { EmbeddedItem } from "../../../embedded-support/src/embeddedScreenInterface";
import { resolveReviewItems } from "./resolveReviewItems";

// Extracts prompts embedded in the URL and resolves attachments as necessary
export default function useResolvedReviewItems(
  embeddedItems: EmbeddedItem[],
): ReviewItem[] | null {
  const [items, setItems] = React.useState<ReviewItem[] | null>(null);
  React.useEffect(() => {
    resolveReviewItems(embeddedItems).then(setItems);
  }, [embeddedItems]);
  return items;
}
