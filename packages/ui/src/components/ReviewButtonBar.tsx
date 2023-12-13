import { TaskContentType, TaskRepetitionOutcome } from "@withorbit/core";
import React, { useRef } from "react";
import { View } from "react-native";
import { colors, layout } from "../styles/index.js";
import { ColorPalette } from "../styles/colors.js";
import { SizeClass } from "../styles/layout.js";
import Button, { ButtonPendingActivationState } from "./Button.jsx";
import { useKeyDown } from "./hooks/useKey.js";
import useLayout from "./hooks/useLayout.js";
import { IconName } from "./IconShared.js";

interface Shortcuts {
  [key: string]: {
    callback: () => void;
    disabled?: boolean;
  };
}

function getShortcuts(
  isShowingAnswer: boolean,
  onMark: (outcome: TaskRepetitionOutcome) => void,
  onReveal: () => void,
): Shortcuts {
  const actions = [
    () => onMark(TaskRepetitionOutcome.Forgotten),
    () => onMark(TaskRepetitionOutcome.Remembered),
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
  promptType: TaskContentType,
  outcome: TaskRepetitionOutcome.Remembered | TaskRepetitionOutcome.Forgotten,
  isVeryNarrow: boolean,
) {
  switch (outcome) {
    case TaskRepetitionOutcome.Remembered:
      switch (promptType) {
        case TaskContentType.QA:
        case TaskContentType.Cloze:
          return isVeryNarrow ? "Succeeded" : "Remembered";
        case TaskContentType.Plain:
          return "Succeeded";
      }
      break;
    case TaskRepetitionOutcome.Forgotten:
      switch (promptType) {
        case TaskContentType.QA:
        case TaskContentType.Cloze:
          return isVeryNarrow ? "Needs Work" : "Forgotten";
        case TaskContentType.Plain:
          return "Needs Practice";
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
  sizeClass,
  onMark,
  onReveal,
  onPendingOutcomeChange,
  promptType,
  isShowingAnswer,
  insetBottom,
}: {
  colorPalette: ColorPalette | null;
  sizeClass: SizeClass;
  promptType: TaskContentType;
  onMark: (outcome: TaskRepetitionOutcome) => void;
  onReveal: () => void;
  onPendingOutcomeChange: (
    pendingOutcome: TaskRepetitionOutcome | null,
  ) => void;
  isShowingAnswer: boolean;
  insetBottom?: number;
}) {
  const { width, onLayout } = useLayout();
  const isVeryNarrow = width > 0 && width <= 320;

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
      paddingBottom: Math.max(
        layout.gridUnit * 2,
        insetBottom - layout.gridUnit * 2,
      ),
    }),
  };

  const forgottenButtonPendingState =
    useRef<ButtonPendingActivationState>(null);
  const rememberedButtonPendingState =
    useRef<ButtonPendingActivationState>(null);

  function dispatchPendingMarkingInteraction() {
    onPendingOutcomeChange(
      forgottenButtonPendingState.current === "pressed"
        ? TaskRepetitionOutcome.Forgotten
        : rememberedButtonPendingState.current === "pressed"
          ? TaskRepetitionOutcome.Remembered
          : null,
    );
  }

  let children: React.ReactNode;
  if (promptType && colorPalette) {
    const sharedButtonProps = {
      color: colors.white,
      accentColor: colorPalette.accentColor,
      style: buttonStyle,
      backgroundColor: colorPalette.secondaryBackgroundColor,
    } as const;

    const smallButtonBlock = (
      <View
        style={{
          flexGrow: 0,
          flexShrink: 0,
          justifyContent: "flex-end",
        }}
      >
        <Button
          {...sharedButtonProps}
          style={{ flexGrow: 1, justifyContent: "flex-end" }}
          size="small"
          onPress={() => onMark(TaskRepetitionOutcome.Skipped)}
          iconName={IconName.DoubleArrowRight}
          title="Skip"
          alignment="right"
        />
      </View>
    );

    if (isShowingAnswer) {
      children = (
        <>
          <Button
            {...sharedButtonProps}
            key={"Forgotten"}
            onPress={() => onMark(TaskRepetitionOutcome.Forgotten)}
            iconName={IconName.Cross}
            title={getButtonTitle(
              promptType,
              TaskRepetitionOutcome.Forgotten,
              isVeryNarrow,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              forgottenButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={firstButtonSlop}
          />
          <Button
            {...sharedButtonProps}
            key={"Remembered"}
            onPress={() => onMark(TaskRepetitionOutcome.Remembered)}
            iconName={IconName.Check}
            title={getButtonTitle(
              promptType,
              TaskRepetitionOutcome.Remembered,
              isVeryNarrow,
            )}
            onPendingInteractionStateDidChange={(pendingActivationState) => {
              rememberedButtonPendingState.current = pendingActivationState;
              dispatchPendingMarkingInteraction();
            }}
            hitSlop={secondButtonSlop}
          />
          {sizeClass !== "compact" && smallButtonBlock}
        </>
      );
    } else {
      children = (
        <>
          <Button
            {...sharedButtonProps}
            onPress={onReveal}
            iconName={IconName.Reveal}
            title={"Show Answer"}
            key={"Show answer"}
            hitSlop={firstButtonSlop}
          />
          {smallButtonBlock}
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
