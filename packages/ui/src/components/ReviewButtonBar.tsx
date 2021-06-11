import {
  applicationPromptType,
  qaPromptType,
  clozePromptType,
  PromptRepetitionOutcome,
  PromptType,
} from "@withorbit/core";
import React, { useRef } from "react";
import { View } from "react-native";
import { colors, layout } from "../styles";
import { ColorPalette } from "../styles/colors";
import unreachableCaseError from "../util/unreachableCaseError";
import Button, { ButtonPendingActivationState } from "./Button";
import { useKeyDown } from "./hooks/useKey";
import useLayout from "./hooks/useLayout";
import { IconName } from "./IconShared";
import Spacer from "./Spacer";

export interface PendingMarkingInteractionState {
  pendingActionOutcome: PromptRepetitionOutcome;
}

interface Shortcuts {
  [key: string]: {
    callback: () => void;
    disabled?: boolean;
  };
}

function getShortcuts(
  isShowingAnswer: boolean,
  onMark: (outcome: PromptRepetitionOutcome) => void,
  onReveal: () => void,
): Shortcuts {
  const actions = [
    () => onMark(PromptRepetitionOutcome.Forgotten),
    () => onMark(PromptRepetitionOutcome.Remembered),
  ];

  const _shortcuts: Shortcuts = {
    // default action (Space)
    " ": { callback: isShowingAnswer ? actions[1] : onReveal },
  };

  actions.forEach((action, i) => {
    // list of actions (1, 2, 3, ...)
    _shortcuts[i + 1] = { callback: action, disabled: !isShowingAnswer };
  });

  return _shortcuts;
}

function getButtonTitle(
  promptType: PromptType | null,
  outcome: PromptRepetitionOutcome,
  isVeryNarrow: boolean,
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
          return isVeryNarrow ? "Forgot" : "Forgotten";
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
  const isVeryNarrow = width > 0 && width < 320;

  const shortcuts = getShortcuts(isShowingAnswer, onMark, onReveal);

  useKeyDown((event) => {
    if (
      Object.keys(shortcuts).includes(event.key) &&
      !shortcuts[event.key].disabled &&
      !event.repeat
    ) {
      shortcuts[event.key].callback();
    }
  });

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
            key={"Forgotten"}
            onPress={() => onMark(PromptRepetitionOutcome.Forgotten)}
            iconName={IconName.Cross}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Forgotten,
              isVeryNarrow,
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
            style={[buttonStyle, { minWidth: 176 }]}
            key={"Remembered"}
            onPress={() => onMark(PromptRepetitionOutcome.Remembered)}
            iconName={IconName.Check}
            title={getButtonTitle(
              promptType,
              PromptRepetitionOutcome.Remembered,
              isVeryNarrow,
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
            key={"Show answer"}
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
          flexDirection: "row",
        },
      ]}
      onLayout={onLayout}
    >
      {width > 0 && children}
    </View>
  );
});

export default ReviewButtonBar;
