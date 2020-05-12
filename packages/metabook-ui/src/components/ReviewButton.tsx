import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  PromptRepetitionOutcome,
  PromptType,
} from "metabook-core";
import React from "react";
import { ButtonProps, StyleProp, ViewStyle } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError";
import BigButton from "./BigButton";

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
    <BigButton
      {...props}
      title={getTitle(props.promptType, props.outcome)}
    ></BigButton>
  );
}
