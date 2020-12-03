import {
  applyActionLogToPromptState,
  PromptActionLog,
  PromptState,
  ActionLogID,
} from "metabook-core";
import {
  ReviewAreaMarkingRecord,
  ReviewAreaProps,
  ReviewItem,
  styles,
  useLayout,
  useTransitioningColorValue,
} from "metabook-ui";
import { getColorPaletteForReviewItem } from "metabook-ui/dist/reviewItem";
import { colors, layout } from "metabook-ui/dist/styles";
import React, { useCallback, useMemo, useState } from "react";
import { Animated, Easing, Insets, View } from "react-native";

export interface ReviewSessionWrapperProps {
  baseItems: ReviewItem[];
  onMark: (
    markingRecord: ReviewAreaMarkingRecord,
  ) => Promise<{ log: PromptActionLog; id: ActionLogID }[]>;
  overrideColorPalette?: styles.colors.ColorPalette;
  children: (args: {
    onMark: (markingRecord: ReviewAreaMarkingRecord) => void;
    items: ReviewItem[];
    baseItems: ReviewItem[];
    currentItemIndex: number;
    containerSize: { width: number; height: number } | null;
  }) => React.ReactNode;
  insets?: Insets;
}

export function ReviewSessionWrapper({
  baseItems,
  onMark,
  overrideColorPalette,
  children,
  insets,
}: ReviewSessionWrapperProps) {
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [localStates, setLocalStates] = useState<Map<ReviewItem, PromptState>>(
    new Map(),
  );

  const localOnMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      const logs = await onMark(marking);
      setLocalStates((localStates) => {
        let basePromptState: PromptState | null =
          marking.reviewItem.promptState;
        for (const { log, id } of logs) {
          const newPromptState = applyActionLogToPromptState({
            promptActionLog: log,
            actionLogID: id,
            basePromptState,
            schedule: "default",
          });
          if (newPromptState instanceof Error) {
            throw newPromptState;
          }
          basePromptState = newPromptState;
        }
        if (!basePromptState) {
          throw new Error(
            "Invariant violation: applying marking logs should produce prompt state",
          );
        }

        return new Map([...localStates, [marking.reviewItem, basePromptState]]);
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

  const currentColorPalette =
    overrideColorPalette ??
    (items[currentItemIndex]
      ? getColorPaletteForReviewItem(items[currentItemIndex])
      : getColorPaletteForReviewItem(items[items.length - 1])) ??
    colors.palettes.red;
  const backgroundColor = useTransitioningColorValue({
    value: currentColorPalette.backgroundColor,
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

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor,
        paddingTop: insets?.top ?? 0,
        paddingLeft: insets?.left ?? 0,
        paddingRight: insets?.right ?? 0,
        paddingBottom: insets?.bottom ?? 0,
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
        {children({
          onMark: localOnMark,
          currentItemIndex,
          items,
          baseItems,
          containerSize:
            containerWidth > 0
              ? { width: containerWidth, height: containerHeight }
              : null,
        })}
      </View>
    </Animated.View>
  );
}
