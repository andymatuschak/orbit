import { ReviewItem } from "metabook-ui";
import React from "react";
import { EmbeddedItem } from "./embeddedItem";
import { getReviewItems } from "./getReviewItems";

// Extracts prompts embedded in the URL and resolves attachments as necessary
export default function useReviewItems(): ReviewItem[] | null {
  const [items, setItems] = React.useState<ReviewItem[] | null>(null);
  React.useEffect(() => {
    // Try to deserialize PromptTasks from anchor.
    if (typeof window === undefined) {
      console.log("window is unavailable; skipping review item extraction");
      return;
    }

    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const tasksString = params.get("i");
    if (tasksString) {
      const embeddedItems: EmbeddedItem[] = JSON.parse(tasksString);
      // TODO validate items
      getReviewItems(embeddedItems).then(setItems);
    } else {
      throw new Error("No review items supplied");
    }
  }, []);

  return items;
}
