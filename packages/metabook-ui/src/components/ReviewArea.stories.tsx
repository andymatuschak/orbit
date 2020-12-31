import { boolean, number, text, withKnobs } from "@storybook/addon-knobs";
import {
  applyActionLogToPromptState,
  getIDForActionLog,
  getIDForPromptTask,
  PromptID,
  PromptRepetitionActionLog,
  PromptState,
  QAPromptTask,
  qaPromptType,
  repetitionActionLogType,
} from "metabook-core";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, Easing, View } from "react-native";
import { ReviewAreaItem } from "../reviewAreaItem";
import { colors } from "../styles";
import { generateReviewItem } from "./__fixtures__/generateReviewItem";
import DebugGrid from "./DebugGrid";
import { useTransitioningColorValue } from "./hooks/useTransitioningValue";
import ReviewArea from "./ReviewArea";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
  decorators: [withKnobs],
};

export function Basic() {
  const colorKnobOffset = number("color shift", 0, {
    min: 0,
    max: Object.keys(colors.palettes).length - 1,
    step: 1,
    range: true,
  });

  const questionOverrideText = text("Question override text", "");
  const answerOverrideText = text("Answer override text", "");
  const sourceContext = text("Source context", "");

  const items = useMemo<ReviewAreaItem[]>(
    () =>
      Array.from(new Array(25).keys()).map((i) =>
        generateReviewItem(
          questionOverrideText || `Question ${i + 1}`,
          answerOverrideText || `Answer ${i + 1}`,
          sourceContext,
          colors.orderedPaletteNames[
            (i + colorKnobOffset) % colors.orderedPaletteNames.length
          ],
        ),
      ),
    [questionOverrideText, answerOverrideText, sourceContext, colorKnobOffset],
  );
  const [localPromptStates, setLocalPromptStates] = React.useState<
    PromptState[]
  >([]);

  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const backgroundColor = useTransitioningColorValue({
    value:
      colors.palettes[
        colors.orderedPaletteNames[
          (currentItemIndex + colorKnobOffset) %
            colors.orderedPaletteNames.length
        ]
      ].backgroundColor,
    timing: {
      type: "timing",
      duration: 150,
      easing: Easing.linear,
      useNativeDriver: false,
    },
  });

  const mergedItems = React.useMemo(
    () =>
      items?.map((item, index) =>
        localPromptStates[index]
          ? { ...item, promptState: localPromptStates[index] }
          : item,
      ),
    [items, localPromptStates],
  );

  return (
    <Animated.View
      style={{
        backgroundColor,
        height: "100vh",
      }}
    >
      <View style={{ flex: 1 }}>
        {boolean("Show debug grid", false) && <DebugGrid />}
        <ReviewArea
          items={mergedItems}
          insetBottom={number("Bottom safe inset", 0)}
          onPendingOutcomeChange={() => {
            return;
          }}
          onMark={useCallback(async ({ outcome }) => {
            const log: PromptRepetitionActionLog<QAPromptTask> = {
              actionLogType: repetitionActionLogType,
              context: null,
              outcome,
              parentActionLogIDs: [],
              taskID: getIDForPromptTask({
                promptType: qaPromptType,
                promptID: "testID" as PromptID,
                promptParameters: null,
              }),
              taskParameters: null,
              timestampMillis: Date.now(),
            };
            const actionLogID = await getIDForActionLog(log);
            setLocalPromptStates((states) => {
              return [
                ...states,
                applyActionLogToPromptState({
                  promptActionLog: log,
                  actionLogID,
                  schedule: "default",
                  basePromptState: null,
                }) as PromptState,
              ];
            });

            setCurrentItemIndex((currentItemIndex) => currentItemIndex + 1);
          }, [])}
          currentItemIndex={currentItemIndex}
        />
      </View>
    </Animated.View>
  );
}
