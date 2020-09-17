import {
  applyActionLogToPromptState,
  PromptActionLog,
  PromptState,
} from "metabook-core";
import {
  ReviewAreaMarkingRecord,
  ReviewAreaProps,
  ReviewItem,
  styles,
  useLayout,
  useTransitioningColorValue,
} from "metabook-ui";
import { layout } from "metabook-ui/dist/styles";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, Easing, View } from "react-native";

export function ReviewSessionWrapper({
  baseItems,
  onMark,
  children,
}: {
  baseItems: ReviewItem[];
  onMark: (markingRecord: ReviewAreaMarkingRecord) => PromptActionLog;
  children: (args: {
    onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
    items: ReviewItem[];
    currentItemIndex: number;
    containerWidth: number;
    containerHeight: number;
  }) => React.ReactNode;
}) {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [localStates, setLocalStates] = useState<Map<ReviewItem, PromptState>>(
    new Map(),
  );

  const localOnMark = useCallback<ReviewAreaProps["onMark"]>(
    (marking) => {
      const log = onMark(marking);
      setLocalStates((localStates) => {
        const newPromptState = applyActionLogToPromptState({
          promptActionLog: log,
          basePromptState: marking.reviewItem.promptState,
          schedule: "default",
        });
        if (newPromptState instanceof Error) {
          throw newPromptState;
        }

        return new Map([...localStates, [marking.reviewItem, newPromptState]]);
      });
      setCurrentItemIndex((index) => index + 1);
    },
    [onMark],
  );

  const items = useMemo(
    () =>
      baseItems.map((item) => {
        const localState = localStates.get(item);
        return localState ? { ...item, promptState: localState } : item;
      }),
    [localStates, baseItems],
  );

  const backgroundColor = useTransitioningColorValue({
    value:
      currentItemIndex < items.length
        ? items[currentItemIndex].colorPalette.backgroundColor
        : items[items.length - 1].colorPalette.backgroundColor ??
          styles.colors.white,
    timing: {
      type: "timing",
      useNativeDriver: false,
      duration: 150,
      easing: Easing.linear,
    },
  });

  const {
    width: containerWidth,
    height: containerHeight,
    onLayout,
  } = useLayout();

  console.log("[Performance] Render", Date.now() / 1000.0);

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor,
      }}
    >
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: layout.maximumContentWidth,
          maxHeight: layout.maximumContentHeight,
          margin: "auto",
        }}
        onLayout={onLayout}
      >
        {containerWidth > 0
          ? children({
              onMark: localOnMark,
              currentItemIndex,
              items,
              containerWidth,
              containerHeight,
            })
          : null}
      </View>
    </Animated.View>
  );
}
