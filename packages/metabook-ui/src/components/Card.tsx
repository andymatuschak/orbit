import {
  ApplicationPromptTaskParameters,
  applicationPromptType,
  basicPromptType,
  clozePromptType,
  getNextTaskParameters,
  QAPrompt,
} from "metabook-core";
import React from "react";
import {
  Animated,
  ColorValue,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { PromptReviewItem } from "../reviewItem";
import { layout, colors } from "../styles";
import CardField, { clozeBlankSentinel } from "./CardField";
import FadeView from "./FadeView";
import {
  AnimationSpec,
  useTransitioningValue,
} from "./hooks/useTransitioningValue";
import { Caption, Label } from "./Text";
import WithAnimatedValue = Animated.WithAnimatedValue;

export const cardWidth = 343; // TODO remove
export const baseCardHeight = 439; // TODO REMOVE

export interface CardProps {
  reviewItem: PromptReviewItem;
  backIsRevealed: boolean;

  contextColor?: ColorValue;
  onToggleExplanation?: (isExplanationExpanded: boolean) => unknown;
}

function getQAPrompt(reviewItem: PromptReviewItem): QAPrompt {
  // TODO return some front/back type instead
  switch (reviewItem.prompt.promptType) {
    case basicPromptType:
      return reviewItem.prompt;
    case applicationPromptType:
      const taskParameters = getNextTaskParameters(
        reviewItem.prompt,
        reviewItem.promptState?.lastReviewTaskParameters ?? null,
      ) as ApplicationPromptTaskParameters;
      return reviewItem.prompt.variants[taskParameters.variantIndex];
    case clozePromptType:
      throw new Error("Unimplemented"); // TODO
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

function useAnimatingStyles(
  backIsRevealed: boolean,
): {
  topAreaContextStyle: WithAnimatedValue<ViewStyle>;
  topAreaInteriorStyle: WithAnimatedValue<ViewStyle>;
  bottomFrontStyle: WithAnimatedValue<ViewStyle>;
  bottomBackStyle: WithAnimatedValue<ViewStyle>;
} {
  const topAreaTranslateAnimation = useTransitioningValue({
    value: backIsRevealed ? 1 : 0,
    timing: topAreaTranslationAnimationSpec,
  });
  const bottomAreaTranslateAnimation = useTransitioningValue({
    value: backIsRevealed ? 1 : 0,
    timing: bottomAreaTranslationAnimationSpec,
  });

  return React.useMemo(() => {
    const topAreaTranslation = {
      translateY: topAreaTranslateAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: [16, 0],
      }),
    };

    return {
      topAreaContextStyle: [
        styles.topAreaContext,
        {
          transform: [topAreaTranslation],
        },
      ],
      topAreaInteriorStyle: [
        styles.topAreaInterior,
        {
          transform: [
            topAreaTranslation,
            { scaleX: 0.6667 },
            { scaleY: 0.6667 },
          ],
        },
      ],
      bottomFrontStyle: [
        StyleSheet.absoluteFill,
        {
          transform: [
            {
              translateY: bottomAreaTranslateAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -8],
              }),
            },
          ],
        },
      ],
      bottomBackStyle: [
        StyleSheet.absoluteFill,
        {
          transform: [
            {
              translateY: bottomAreaTranslateAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [30, 0],
              }),
            },
          ],
        },
      ],
    };
  }, [bottomAreaTranslateAnimation, topAreaTranslateAnimation]);
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

export default function Card({
  backIsRevealed,
  contextColor,
  reviewItem,
}: CardProps) {
  const animatingStyles = useAnimatingStyles(backIsRevealed);
  const spec = getQAPrompt(reviewItem);
  return (
    <View style={styles.cardContainer}>
      <FadeView
        isVisible={backIsRevealed}
        durationMillis={topAreaFadeDurationMillis}
        delayMillis={topAreaFadeDelayMillis}
        style={animatingStyles.topAreaContextStyle}
      >
        <Caption color={contextColor ?? colors.ink}>
          Source context TODO
        </Caption>
      </FadeView>
      <View style={styles.topAreaContainer}>
        <FadeView
          isVisible={backIsRevealed}
          durationMillis={topAreaFadeDurationMillis}
          delayMillis={topAreaFadeDelayMillis}
          style={animatingStyles.topAreaInteriorStyle}
        >
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
          />
        </FadeView>
      </View>
      <View style={styles.bottomAreaContainer}>
        <FadeView
          isVisible={backIsRevealed}
          durationMillis={100}
          style={animatingStyles.bottomBackStyle}
        >
          <CardField
            promptField={spec.answer}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
          />
        </FadeView>
        <FadeView
          isVisible={!backIsRevealed}
          durationMillis={70}
          style={animatingStyles.bottomFrontStyle}
        >
          <Label
            style={styles.bottomContextLabel}
            color={contextColor ?? colors.ink}
          >
            Source context TODO
          </Label>
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
          />
        </FadeView>
      </View>
    </View>
  );
}

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

  bottomContextLabel: {
    position: "absolute",
    top: layout.gridUnit * -3,
  },
});
