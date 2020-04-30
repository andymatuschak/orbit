import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  PromptRepetitionOutcome,
  PromptType,
} from "metabook-core";
import React from "react";
import {
  ButtonProps,
  StyleProp,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import colors from "../styles/colors";
import { borderRadius, gridUnit, spacing } from "../styles/layout";
import typography from "../styles/typography";
import unreachableCaseError from "../util/unreachableCaseError";

function getTitle(
  promptType: PromptType | null,
  outcome: PromptRepetitionOutcome,
) {
  switch (outcome) {
    case PromptRepetitionOutcome.Remembered:
      switch (promptType) {
        case basicPromptType:
        case clozePromptType:
        case null:
          return "Remembered";
        case applicationPromptType:
          return "Answered";
      }
      throw unreachableCaseError(promptType);
    case PromptRepetitionOutcome.Forgotten:
      switch (promptType) {
        case basicPromptType:
        case clozePromptType:
        case null:
          return "Didn’t remember";
        case applicationPromptType:
          return "Couldn’t answer";
      }
  }
}

export default function ReviewButton(
  props: {
    promptType: PromptType | null;
    outcome: PromptRepetitionOutcome;
    extraStyles?: StyleProp<ViewStyle>;
  } & Omit<ButtonProps, "title">,
) {
  return (
    <TouchableOpacity {...props} activeOpacity={0.6} style={props.extraStyles}>
      <View
        style={{
          backgroundColor: colors.key60,
          height: gridUnit * 3,
          borderRadius: borderRadius,
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: spacing.spacing05,
          paddingRight: spacing.spacing05,
          opacity: props.disabled ? 0.1 : 1.0,
        }}
      >
        <Text
          style={{ color: colors.key00, ...typography.label }}
          selectable={false}
        >
          {getTitle(props.promptType, props.outcome)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
