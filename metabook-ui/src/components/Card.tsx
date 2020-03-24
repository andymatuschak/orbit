import {
  CardState,
  PromptType,
  MetabookSpacedRepetitionSchedule,
  QuestionAnswerData,
} from "metabook-core";
import React from "react";
import { View, StyleSheet } from "react-native";
import FadeView from "./FadeView";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";
import colors from "../styles/colors";
import { borderRadius, gridUnit } from "../styles/layout";
import CardTextArea from "./CardTextArea";

export interface CardProps {
  isRevealed: boolean;
  isOccluded?: boolean;
  showsNeedsRetryNotice?: boolean;
  promptType: PromptType;
  questionAnswerData: QuestionAnswerData;
  cardState: CardState | null;
  reviewMarkingInteractionState: ReviewMarkingInteractionState | null;
  schedule: MetabookSpacedRepetitionSchedule;
  onToggleExplanation?: (isExplanationExpanded: boolean) => unknown;
  shouldLabelApplicationPrompts: boolean;
}

export default function Card(props: CardProps) {
  return (
    <View style={styles.container}>
      <View style={styles.questionArea}>
        <CardTextArea>{props.questionAnswerData.question}</CardTextArea>
      </View>
      <View style={styles.bottomArea}>
        <View style={styles.answerArea}>
          <CardTextArea>{props.questionAnswerData.answer}</CardTextArea>
        </View>
        <View style={styles.progressIndicator} />
        <FadeView isVisible={!props.isRevealed} style={styles.answerCover} />
      </View>
    </View>
  );
}

export const baseCardHeight = 439;
const interiorRegionHeight = 196;

const styles = StyleSheet.create({
  container: {
    width: 343,
    minHeight: baseCardHeight,
    maxHeight: baseCardHeight,

    shadowColor: colors.key80,
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.backgroundGray,
    borderRadius,

    flexDirection: "column",
  },

  questionArea: {
    borderTopLeftRadius: borderRadius,
    borderTopRightRadius: borderRadius,
    overflow: "hidden",
    backgroundColor: "white",
    flexBasis: interiorRegionHeight,
    padding: gridUnit,
    borderBottomColor: colors.key10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  answerArea: {
    flexBasis: interiorRegionHeight,
    backgroundColor: colors.key00,
    padding: gridUnit,
    borderBottomColor: colors.key10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  progressIndicator: {
    backgroundColor: "white",
    flex: 1,
    borderBottomLeftRadius: borderRadius,
    borderBottomRightRadius: borderRadius,
    overflow: "hidden",
  },

  bottomArea: {
    flex: 1,
  },

  answerCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.key00,
    borderBottomLeftRadius: borderRadius,
    borderBottomRightRadius: borderRadius,
    overflow: "hidden",
  },

  answerCoverInterior: {},
});
