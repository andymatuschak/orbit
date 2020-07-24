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
import { colors, layout } from "../styles";
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
  topAreaStyle: WithAnimatedValue<ViewStyle>;
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
    return {
      topAreaStyle: [
        styles.topAreaContainer,
        {
          transform: [
            {
              translateY: topAreaTranslateAnimation.interpolate({
                inputRange: [0, 1],
                outputRange: [16, 0],
              }),
            },
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

export default React.memo(function Card({
  backIsRevealed,
  contextColor,
  reviewItem,
}: CardProps) {
  const animatingStyles = useAnimatingStyles(backIsRevealed);
  const spec = getQAPrompt(reviewItem);

  const [frontSizeVariant, setFrontSizeVariant] = React.useState<
    number | undefined
  >(undefined);

  return (
    <View style={styles.cardContainer}>
      <FadeView
        isVisible={backIsRevealed}
        durationMillis={100}
        delayMillis={60}
        style={animatingStyles.topAreaStyle}
      >
        <Caption
          color={contextColor ?? colors.ink}
          style={styles.topContextLabel}
        >
          Source context TODO
        </Caption>
        <View style={styles.topTextContainer}>
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            largestSizeVariant={
              frontSizeVariant === undefined ? undefined : frontSizeVariant + 1
            }
            smallestSizeVariant={4}
          />
        </View>
      </FadeView>
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
            onLayout={setFrontSizeVariant}
          />
        </FadeView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  cardContainer: {
    flex: 1,
  },

  topAreaContainer: {
    flex: 2,
    // This is a bit tricky: we want the text regions of the front and back to have a 3:2 ratio; this excludes the context label, which is printed above. So we leave room at the top of the top area for the context label then shift it up.
    paddingTop: layout.gridUnit * 2,
  },

  topContextLabel: {
    marginTop: -layout.gridUnit * 2,
    marginBottom: layout.gridUnit,
  },

  topTextContainer: {
    flex: 1,
    overflow: "hidden",
    width: "66.67%",
  },

  bottomAreaContainer: {
    flex: 3,
  },

  bottomContextLabel: {
    position: "absolute",
    top: layout.gridUnit * -3,
  },
});
