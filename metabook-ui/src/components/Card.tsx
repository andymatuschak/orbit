import {
  ClozePromptParameters,
  MetabookSpacedRepetitionSchedule,
  QAPromptSpec,
} from "metabook-core";
import React from "react";
import { StyleSheet, View } from "react-native";
import { PromptReviewItem } from "../reviewItem";
import colors from "../styles/colors";
import { borderRadius } from "../styles/layout";
import CardField from "./CardField";
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
      const clozeContents = reviewItem.promptSpec.body.contents;
      const {
        clozeIndex,
      } = reviewItem.promptParameters as ClozePromptParameters;

      let matchIndex = 0;
      let match: RegExpExecArray | null;
      for (; (match = clozeRegexp.exec(clozeContents)); matchIndex++) {
        if (matchIndex === clozeIndex) {
          return {
            question: {
              contents: (
                clozeContents.slice(0, match.index) +
                " ___ " +
                clozeContents.slice(clozeRegexp.lastIndex)
              ).replace(clozeRegexp, "$1"),
              attachments: reviewItem.promptSpec.body.attachments,
            },
            answer: {
              contents: match[1],
              attachments: [],
            },
            explanation: null,
          };
        }
      }
      return {
        question: { contents: clozeContents, attachments: [] },
        answer: {
          contents: `(invalid cloze: couldn't find cloze deletion with index ${clozeIndex})`,
          attachments: [],
        },
        explanation: null,
      };
  }
}

export default function Card(props: CardProps) {
  const spec = getQAPromptSpec(props.reviewItem);
  return (
    <View style={styles.container}>
      <View style={styles.questionArea}>
        <CardField
          promptField={spec.question}
          attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
        />
      </View>
      <View style={styles.bottomArea}>
        <View style={styles.answerArea}>
          <CardField
            promptField={spec.answer}
            attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
          />
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
    borderBottomColor: colors.key10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  answerArea: {
    flexBasis: interiorRegionHeight,
    backgroundColor: colors.key00,
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
