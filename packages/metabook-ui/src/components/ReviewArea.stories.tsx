import { testBasicPrompt } from "metabook-sample-data";
import React, { useCallback, useState } from "react";
import { View } from "react-native";
import { ReviewItem } from "../reviewItem";
import ReviewArea from "./ReviewArea";
import { colors } from "../styles";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
};

function generateReviewItem(questionText: string): ReviewItem {
  return {
    reviewItemType: "prompt",
    promptState: null,
    prompt: {
      ...testBasicPrompt,
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
    <View
      style={{
        margin: 16,
        padding: 16,
        backgroundColor: colors.bg[0],
        height: 500,
      }}
    >
      <View style={{ flex: 1 }}>
        <ReviewArea items={items} onMark={onMark} schedule="aggressiveStart" />
      </View>
    </View>
  );
}
