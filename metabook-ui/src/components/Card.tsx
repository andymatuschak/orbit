import {
  ClozePromptParameters,
  MetabookSpacedRepetitionSchedule,
  QAPromptSpec,
} from "metabook-core";
import React from "react";
import { StyleSheet, View } from "react-native";
import { PromptReviewItem } from "../reviewItem";
import colors from "../styles/colors";
import { borderRadius, gridUnit } from "../styles/layout";
import CardTextArea from "./CardTextArea";
import FadeView from "./FadeView";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";

export interface CardProps {
  reviewItem: PromptReviewItem;

  isRevealed: boolean;
  isOccluded?: boolean;
  showsNeedsRetryNotice?: boolean;
  reviewMarkingInteractionState: ReviewMarkingInteractionState | null;
  schedule: MetabookSpacedRepetitionSchedule;
  onToggleExplanation?: (isExplanationExpanded: boolean) => unknown;
  shouldLabelApplicationPrompts: boolean;
}

function getQAPromptSpec(reviewItem: PromptReviewItem): QAPromptSpec {
  switch (reviewItem.promptSpec.promptSpecType) {
    case "basic":
      return reviewItem.promptSpec;
    case "applicationPrompt":
      return reviewItem.promptSpec.variants[
        reviewItem.promptState?.taskParameters?.variantIndex ?? 0
      ];
    case "cloze":
      const clozeRegexp = /{([^}]+?)}/g;
      const clozeContents = reviewItem.promptSpec.contents;
      const {
        clozeIndex,
      } = reviewItem.promptParameters as ClozePromptParameters;

      let matchIndex = 0;
      let match: RegExpExecArray | null;
      for (; (match = clozeRegexp.exec(clozeContents)); matchIndex++) {
        if (matchIndex === clozeIndex) {
          return {
            question: (
              clozeContents.slice(0, match.index) +
              " ___ " +
              clozeContents.slice(clozeRegexp.lastIndex)
            ).replace(clozeRegexp, "$1"),
            answer: match[1],
            explanation: null,
          };
        }
      }
      return {
        question: clozeContents,
        answer: `(invalid cloze: couldn't find cloze deletion with index ${clozeIndex})`,
        explanation: null,
      };
  }
}

export default function Card(props: CardProps) {
  const spec = getQAPromptSpec(props.reviewItem);
  return (
    <View style={styles.container}>
      <View style={styles.questionArea}>
        <CardTextArea>{spec.question}</CardTextArea>
      </View>
      <View style={styles.bottomArea}>
        <View style={styles.answerArea}>
          <CardTextArea>{spec.answer}</CardTextArea>
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
