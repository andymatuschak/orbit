import {
  ApplicationPromptTaskParameters,
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  getNextTaskParameters,
  MetabookSpacedRepetitionSchedule,
  QAPrompt,
} from "metabook-core";
import React from "react";
import { StyleSheet, View } from "react-native";
import {
  ApplicationPromptReviewItem,
  BasicPromptReviewItem,
  ClozePromptReviewItem,
  PromptReviewItem,
} from "../reviewItem";
import { layout } from "../styles";
import CardField, { clozeBlankSentinel } from "./CardField";
import FadeView from "./FadeView";
import {
  AnimationSpec,
  useTransitioningValue,
} from "./hooks/useTransitioningValue";
import { ReviewMarkingInteractionState } from "./QuestionProgressIndicator";
import { Caption } from "./Text";

export const cardWidth = 343; // TODO remove

export interface CardProps {
  reviewItem: PromptReviewItem;

  backIsRevealed: boolean;
  isDisplayed?: boolean;
  reviewMarkingInteractionState: ReviewMarkingInteractionState | null;
  schedule: MetabookSpacedRepetitionSchedule;
  onToggleExplanation?: (isExplanationExpanded: boolean) => unknown;
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

const topAreaFadeDurationMillis = 100;
const topAreaFadeDelayMillis = 60;

const bottomAreaTranslationAnimationSpec: AnimationSpec = {
  type: "spring",
  bounciness: 0,
  speed: 28,
  useNativeDriver: true,
};

const topAreaTranslationAnimationSpec: AnimationSpec = {
  ...bottomAreaTranslationAnimationSpec,
  delay: 50,
};

function QAPromptCard(
  props: Omit<CardProps, "reviewItem"> & {
    reviewItem: BasicPromptReviewItem | ApplicationPromptReviewItem;
  },
) {
  const bottomAreaRevealAnimation = useTransitioningValue({
    value: props.backIsRevealed ? 1 : 0,
    timing: bottomAreaTranslationAnimationSpec,
  });
  const topAreaRevealAnimation = useTransitioningValue({
    value: props.backIsRevealed ? 1 : 0,
    timing: topAreaTranslationAnimationSpec,
  });
  const topAreaTranslation = React.useMemo(
    () => ({
      translateY: topAreaRevealAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [16, 0],
      }),
    }),
    [topAreaRevealAnimation],
  );

  const topAreaContextStyle = React.useMemo(
    () => [
      styles.topAreaContext,
      {
        transform: [topAreaTranslation],
      },
    ],
    [topAreaTranslation],
  );

  const topAreaInteriorStyle = React.useMemo(
    () => [
      styles.topAreaInterior,
      {
        transform: [topAreaTranslation, { scaleX: 0.6667 }, { scaleY: 0.6667 }],
      },
    ],
    [topAreaTranslation],
  );

  const bottomFrontStyle = React.useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        transform: [
          {
            translateY: bottomAreaRevealAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -8],
            }),
          },
        ],
      },
    ],
    [bottomAreaRevealAnimation],
  );

  const bottomBackStyle = React.useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        transform: [
          {
            translateY: bottomAreaRevealAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [30, 0],
            }),
          },
        ],
      },
    ],
    [bottomAreaRevealAnimation],
  );

  const spec = getQAPrompt(props.reviewItem);
  return (
    <View style={styles.cardContainer}>
      <FadeView
        isVisible={props.backIsRevealed}
        durationMillis={topAreaFadeDurationMillis}
        delayMillis={topAreaFadeDelayMillis}
        style={topAreaContextStyle}
      >
        <Caption>Source context TODO</Caption>
      </FadeView>
      <View style={styles.topAreaContainer}>
        <FadeView
          isVisible={props.backIsRevealed}
          durationMillis={topAreaFadeDurationMillis}
          delayMillis={topAreaFadeDelayMillis}
          style={topAreaInteriorStyle}
        >
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
          />
        </FadeView>
      </View>
      <View style={styles.bottomAreaContainer}>
        <FadeView
          isVisible={props.backIsRevealed}
          durationMillis={100}
          style={bottomBackStyle}
        >
          <CardField
            promptField={spec.answer}
            attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
          />
        </FadeView>
        <FadeView
          isVisible={!props.backIsRevealed}
          durationMillis={70}
          style={bottomFrontStyle}
        >
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={props.reviewItem.attachmentResolutionMap}
          />
        </FadeView>
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
  return null;
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

export const baseCardHeight = 439; // TODO REMOVE

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
  },

  topAreaContainer: {
    flex: 2,
  },

  topAreaInterior: {
    position: "absolute",
    width: "100%",
    height: "150%", // pre-shrunken size should be equivalent to flex-3 in this flex-2 container
    // There's no transform origin in RN, so the view is scaled from its center. We translate to compensate:
    left: "-16.667%", // Scaling down by 2/3 leaves margins of 1/6 the original size.
    top: "-25%", // This is 1/6 scaled up by 150%
  },

  topAreaContext: {
    marginBottom: layout.gridUnit,
  },

  bottomAreaContainer: {
    flex: 3,
  },
});
