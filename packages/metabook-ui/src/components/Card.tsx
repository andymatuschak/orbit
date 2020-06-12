import {
  ApplicationPromptTaskParameters,
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  getNextTaskParameters,
  MetabookSpacedRepetitionSchedule,
  QAPrompt,
} from "metabook-core";
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import {
  ApplicationPromptReviewItem,
  BasicPromptReviewItem,
  ClozePromptReviewItem,
  PromptReviewItem,
} from "../reviewItem";
import colors from "../styles/colors";
import { borderRadius } from "../styles/layout";
import CardField, { clozeBlankSentinel } from "./CardField";
import FadeView from "./FadeView";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";

export const cardWidth = 343;

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

function getQAPrompt(
  reviewItem: BasicPromptReviewItem | ApplicationPromptReviewItem,
): QAPrompt {
  switch (reviewItem.prompt.promptType) {
    case "basic":
      return reviewItem.prompt;
    case "applicationPrompt":
      const taskParameters = getNextTaskParameters(
        reviewItem.prompt,
        reviewItem.promptState?.lastReviewTaskParameters ?? null,
      ) as ApplicationPromptTaskParameters;
      return reviewItem.prompt.variants[taskParameters.variantIndex];
  }
}

function QAPromptCard(
  props: Omit<CardProps, "reviewItem"> & {
    reviewItem: BasicPromptReviewItem | ApplicationPromptReviewItem;
  },
) {
  const spec = getQAPrompt(props.reviewItem);
  return (
    <View style={styles.container}>
      <View style={[styles.questionArea, styles.qaPromptContentArea]}>
        <CardField
          promptField={spec.question}
          attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
        />
      </View>
      <View style={styles.bottomArea}>
        <View style={[styles.answerArea, styles.qaPromptContentArea]}>
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

function formatClozePromptContents(
  clozeContents: string,
  isRevealed: boolean,
  clozeIndex: number,
) {
  let matchIndex = 0;
  const clozeRegexp = /{([^}]+?)}/g;
  let match: RegExpExecArray | null;

  let output = "";
  let previousMatchStartIndex = 0;
  let foundSelectedClozeDeletion = false;
  for (; (match = clozeRegexp.exec(clozeContents)); matchIndex++) {
    output += clozeContents.slice(previousMatchStartIndex, match.index);
    if (matchIndex === clozeIndex) {
      foundSelectedClozeDeletion = true;
      if (isRevealed) {
        // We emit the original delimeted string (i.e. "{cloze}"), which is styled in CardField.
        output += clozeContents.slice(match.index, clozeRegexp.lastIndex);
      } else {
        output += clozeBlankSentinel;
      }
    } else {
      output += match[1]; // strip the braces
    }
    previousMatchStartIndex = clozeRegexp.lastIndex;
  }
  output += clozeContents.slice(previousMatchStartIndex);

  if (foundSelectedClozeDeletion) {
    return output;
  } else {
    return `(invalid cloze: couldn't find cloze deletion with index ${clozeIndex})`;
  }
}

function ClozePromptCard(
  props: Omit<CardProps, "reviewItem"> & {
    reviewItem: ClozePromptReviewItem;
  },
) {
  const { isRevealed } = props;
  const {
    promptParameters: { clozeIndex },
    prompt: { body },
    attachmentResolutionMap,
  } = props.reviewItem;
  const promptField = useMemo(
    () => ({
      contents: formatClozePromptContents(
        body.contents,
        isRevealed,
        clozeIndex,
      ),
      attachments: body.attachments,
    }),
    [isRevealed, clozeIndex, body],
  );
  return (
    <View style={styles.container}>
      <View style={[styles.questionArea, { flexGrow: 1 }]}>
        <CardField
          promptField={promptField}
          attachmentResolutionMap={attachmentResolutionMap}
        />
      </View>
      <View style={styles.bottomArea}>
        <View style={styles.progressIndicator} />
        <FadeView isVisible={!isRevealed} style={styles.answerCover} />
      </View>
    </View>
  );
}

export default function Card(props: CardProps) {
  const prompt = props.reviewItem.prompt;
  switch (prompt.promptType) {
    case basicPromptType:
    case applicationPromptType:
      return (
        <QAPromptCard
          {...props}
          reviewItem={
            props.reviewItem as
              | BasicPromptReviewItem
              | ApplicationPromptReviewItem
          }
        />
      );
    case clozePromptType:
      return (
        <ClozePromptCard
          {...props}
          reviewItem={props.reviewItem as ClozePromptReviewItem}
        />
      );
  }
}

export const baseCardHeight = 439;
const interiorRegionHeight = 196;

const styles = StyleSheet.create({
  container: {
    width: cardWidth,
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

  qaPromptContentArea: {
    flexBasis: interiorRegionHeight,
  },

  questionArea: {
    borderTopLeftRadius: borderRadius,
    borderTopRightRadius: borderRadius,
    overflow: "hidden",
    backgroundColor: "white",
    borderBottomColor: colors.key10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  answerArea: {
    backgroundColor: colors.key00,
    borderBottomColor: colors.key10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  progressIndicator: {
    backgroundColor: "white",
    height: 47,
    borderBottomLeftRadius: borderRadius,
    borderBottomRightRadius: borderRadius,
    overflow: "hidden",
  },

  bottomArea: {},

  answerCover: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.key00,
    borderBottomLeftRadius: borderRadius,
    borderBottomRightRadius: borderRadius,
    overflow: "hidden",
  },

  answerCoverInterior: {},
});
