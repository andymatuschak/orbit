import { testBasicPromptSpec } from "metabook-sample-data";
import React, { useCallback, useState } from "react";
import { ReviewItem } from "../reviewItem";
import ReviewArea from "./ReviewArea";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
};

function generateReviewItem(questionText: string): ReviewItem {
  return {
    reviewItemType: "prompt",
    promptState: null,
    promptSpec: {
      ...testBasicPromptSpec,
      question: { contents: questionText, attachments: [] },
    },
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}

export function Basic() {
  const initialReviewItems: ReviewItem[] = Array.from(
    new Array(5).keys(),
  ).map((i) => generateReviewItem(`Question ${i + 1}`));

  const [items, setItems] = useState(initialReviewItems);

  const onMark = useCallback(() => {
    setItems((tasks) => tasks.slice(1));
  }, []);

  return (
    <ReviewArea
      items={items}
      onMark={onMark}
      schedule="aggressiveStart"
      shouldLabelApplicationPrompts={false}
      onLogin={() => {
        return;
      }}
    />
  );
}
