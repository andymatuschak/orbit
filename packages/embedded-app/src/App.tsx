import { Prompt, PromptParameters } from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import { promptReviewItemType, ReviewArea, ReviewItem } from "metabook-ui";
import React, { useCallback } from "react";

interface EmbeddedItem {
  prompt: Prompt;
  promptParameters: PromptParameters;
}

const defaultItems: ReviewItem[] = [
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
];

function App() {
  const [queue, setQueue] = React.useState<ReviewItem[]>(() => {
    // Try to deserialize PromptTasks from anchor.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const tasksString = params.get("i");
      if (tasksString) {
        const items: EmbeddedItem[] = JSON.parse(tasksString);
        // TODO validate items
        return items.map(
          (item) =>
            ({
              prompt: item.prompt,
              promptParameters: item.promptParameters,
              promptState: null,
              reviewItemType: promptReviewItemType,
              attachmentResolutionMap: null,
            } as ReviewItem),
        );
      }
    }
    return defaultItems;
  });

  const onMark = useCallback(() => {
    setQueue((queue) => queue.slice(1));
  }, []);

  return (
    <div className="App">
      <ReviewArea
        items={queue}
        onMark={onMark}
        schedule="default"
        shouldLabelApplicationPrompts={true}
      />
    </div>
  );
}

export default App;
