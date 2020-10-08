import {
  applicationPromptType,
  qaPromptType,
  clozePromptType,
  PromptRepetitionOutcome,
  PromptType,
} from "metabook-core";
import React, { useRef } from "react";
import { View } from "react-native";
import { colors, layout } from "../styles";
import { ColorPalette } from "../styles/colors";
import unreachableCaseError from "../util/unreachableCaseError";
import Button, { ButtonPendingActivationState } from "./Button";
import useLayout from "./hooks/useLayout";
import { IconName } from "./IconShared";
import Spacer from "./Spacer";

export interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
}

function getButtonTitle(
  promptType: PromptType | null,
  outcome: PromptRepetitionOutcome,
) {
  switch (outcome) {
    case PromptRepetitionOutcome.Remembered:
      switch (promptType) {
        case qaPromptType:
        case clozePromptType:
        case null:
          return "Remembered";
        case applicationPromptType:
          return "Answered";
      }
      throw unreachableCaseError(promptType);
    case PromptRepetitionOutcome.Forgotten:
      switch (promptType) {
        case qaPromptType:
        case clozePromptType:
        case null:
          return "Forgotten";
        case applicationPromptType:
          return "Missed";
      }
  }
}

const firstButtonSlop = {
  top: layout.gridUnit * 4,
  left: layout.gridUnit * 2,
  bottom: layout.gridUnit * 4,
  right: 0,
};
const secondButtonSlop = {
  top: layout.gridUnit * 4,
  right: layout.gridUnit * 2,
  bottom: layout.gridUnit * 4,
  left: 0,
};

const ReviewButtonBar = React.memo(function ReviewButtonArea({
  colorPalette,
  onMark,
  onReveal,
  onPendingOutcomeChange,
  promptType,
  isShowingAnswer,
  insetBottom,
}: {
  colorPalette: ColorPalette | null;
  promptType: PromptType | null;
  onMark: (outcome: PromptRepetitionOutcome) => void;
  onReveal: () => void;
  onPendingOutcomeChange: (
    pendingOutcome: PromptRepetitionOutcome | null,
  ) => void;
  isShowingAnswer: boolean;
  insetBottom?: number;
}) {
  const { width, onLayout } = useLayout();
  const widthSizeClass = layout.getWidthSizeClass(width);
  const isVeryNarrow = width < 360;

  const buttonStyle = {
    flex: 1,
    ...(insetBottom && {
      paddingBottom:
        // The button already has internal padding when the background is showing. We subtract that off if the safe inset area is larger. This is a bit of a hack, relying on internal knowledge of the button metrics. It might be better to have the button subtract off part of its paddingBottom if necessary.
        Math.max(0, insetBottom - layout.gridUnit * 2),
    }),
  };

  const forgottenButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );
  const rememberedButtonPendingState = useRef<ButtonPendingActivationState>(
    null,
  );

  function dispatchPendingMarkingInteraction() {
    onPendingOutcomeChange(
      forgottenButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Forgotten
        : rememberedButtonPendingState.current === "pressed"
        ? PromptRepetitionOutcome.Remembered
        : null,
    );
  }

  const spacer = <Spacer units={0.5} />;

  let children: React.ReactNode;
  if (promptType && colorPalette) {
    const sharedButtonProps = {
      color: colors.white,
      accentColor: colorPalette.accentColor,
      style: buttonStyle,
      backgroundColor: colorPalette.secondaryBackgroundColor,
    } as const;

    if (isShowingAnswer) {
      children = (
        <>
          <Button
            {...sharedButtonProps}
            onPress={() => onMark(PromptRepetitionOutcome.Forgotten)}
            iconName={IconName.Cross}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Forgotten,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              forgottenButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={firstButtonSlop}
          />
          {spacer}
          <Button
            {...sharedButtonProps}
            onPress={() => onMark(PromptRepetitionOutcome.Remembered)}
            iconName={IconName.Check}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Remembered,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              rememberedButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={secondButtonSlop}
          />
        </>
      );
    } else {
      children = (
        <>
          <Button
            {...sharedButtonProps}
            onPress={onReveal}
            iconName={IconName.Reveal}
            title={"Show answer"}
            hitSlop={secondButtonSlop}
          />
        </>
      );
    }
  } else {
    children = null;
  }

  return (
    <View
      style={[
        {
          minHeight: layout.gridUnit * 7,
          flexDirection: isVeryNarrow ? "column" : "row",
          flexWrap: isVeryNarrow ? "wrap" : "nowrap",
        },
      ]}
      onLayout={onLayout}
    >
      {width > 0 && children}
    </View>
  );
});

export default ReviewButtonBar;
