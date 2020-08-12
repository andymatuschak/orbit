import { number, withKnobs, boolean } from "@storybook/addon-knobs";
import {
  applyActionLogToPromptState,
  basicPromptType,
  getIDForPromptTask,
  getIntervalSequenceForSchedule,
  PromptID,
  PromptProvenanceType,
  PromptRepetitionActionLog,
  PromptState,
  PromptTaskParameters,
  repetitionActionLogType,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import React, { useCallback, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { ReviewItem } from "../reviewItem";
import { colors } from "../styles";
import DebugGrid from "./DebugGrid";
import ReviewArea from "./ReviewArea";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
  decorators: [withKnobs()],
};

const intervalSequence = getIntervalSequenceForSchedule("default");
function generateReviewItem(questionText: string): ReviewItem {
  const intervalMillis =
    intervalSequence[Math.floor(Math.random() * (intervalSequence.length - 1))]
      .interval;
  return {
    reviewItemType: "prompt",
    promptState: {
      dueTimestampMillis: 0,
      headActionLogIDs: [],
      intervalMillis,
      bestIntervalMillis: null,
      lastReviewTaskParameters: null,
      lastReviewTimestampMillis: Date.now() - intervalMillis,
      needsRetry: false,
      taskMetadata: {
        isDeleted: false,
        provenance: {
          provenanceType: PromptProvenanceType.Note,
          externalID: "someID",
          modificationTimestampMillis: 0,
          title: "Source note title",
          url: null,
        },
      },
    },
    prompt: {
      ...testBasicPrompt,
      question: { contents: questionText, attachments: [] },
    },
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}

export function Basic() {
  const colorKnobOffset = number("color shift", 0, {
    min: 0,
    max: colors.compositions.length - 1,
    step: 1,
    range: true,
  });

  const [items, setItems] = useState<ReviewItem[]>(() =>
    Array.from(new Array(25).keys()).map((i) =>
      generateReviewItem(`Question ${i + 1}`),
    ),
  );

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [colorCompositionIndex] = React.useState(
    () => new Animated.Value(items.length),
  );
  React.useEffect(
    () =>
      colorCompositionIndex.setValue(
        (currentItemIndex + colorKnobOffset) % colors.compositions.length,
      ),
    [colorKnobOffset],
  );
  const backgroundColor = colorCompositionIndex.interpolate({
    inputRange: Array.from(new Array(colors.compositions.length).keys()),
    outputRange: colors.compositions.map((c) => c.backgroundColor),
  });

  const colorComposition =
    colors.compositions[
      (currentItemIndex + colorKnobOffset) % colors.compositions.length
    ];

  return (
    <Animated.View
      style={{
        margin: 16,
        backgroundColor,
        height: 600,
      }}
    >
      <View style={{ flex: 1 }}>
        {boolean("Show debug grid", false) && <DebugGrid />}
        <ReviewArea
          items={items}
          onMark={useCallback(
            ({ outcome, reviewItem }) => {
              setCurrentItemIndex((currentItemIndex) => {
                Animated.timing(colorCompositionIndex, {
                  toValue:
                    (currentItemIndex + 1 + colorKnobOffset) %
                    colors.compositions.length,
                  duration: 80,
                  easing: Easing.linear,
                  useNativeDriver: true,
                }).start();

                setItems((items) => {
                  const newItems = [...items];
                  newItems[currentItemIndex] = {
                    ...newItems[currentItemIndex],
                  };
                  const log: PromptRepetitionActionLog<PromptTaskParameters> = {
                    actionLogType: repetitionActionLogType,
                    context: null,
                    outcome,
                    parentActionLogIDs: [],
                    taskID: getIDForPromptTask({
                      promptType: basicPromptType,
                      promptID: "testID" as PromptID,
                      promptParameters: null,
                    }),
                    taskParameters: null,
                    timestampMillis: Date.now(),
                  };
                  newItems[
                    currentItemIndex
                  ].promptState = applyActionLogToPromptState({
                    promptActionLog: log,
                    schedule: "default",
                    basePromptState: reviewItem.promptState,
                  }) as PromptState;
                  return newItems;
                });

                return currentItemIndex + 1;
              });
            },
            [colorCompositionIndex, colorKnobOffset],
          )}
          schedule="aggressiveStart"
          currentItemIndex={currentItemIndex}
          {...colorComposition}
        />
      </View>
    </Animated.View>
  );
}
