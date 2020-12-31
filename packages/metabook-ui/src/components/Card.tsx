import {
  ApplicationPromptTask,
  applicationPromptType,
  clozePromptType,
  createClozeMarkupRegexp,
  PromptProvenance,
  PromptProvenanceType,
  QAPrompt,
  QAPromptContents,
  QAPromptTask,
  qaPromptType,
} from "metabook-core";
import React from "react";
import {
  Animated,
  FlexStyle,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import {
  ApplicationReviewItem,
  ClozeReviewItem,
  QAReviewItem,
} from "../../dist/reviewItem";
import { ReviewAreaItem } from "../reviewAreaItem";
import { colors, layout, type } from "../styles";
import Button from "./Button";
import FadeView from "./FadeView";
import {
  AnimatedTransitionTiming,
  useTransitioningValue,
} from "./hooks/useTransitioningValue";
import CardField, { clozeBlankSentinel } from "./PromptFieldRenderer";

function getQAPromptContents<PT extends QAPromptTask | ApplicationPromptTask>(
  reviewItem: ReviewAreaItem<PT>,
): QAPromptContents {
  switch (reviewItem.prompt.promptType) {
    case qaPromptType:
      return reviewItem.prompt as QAPrompt;
    case applicationPromptType:
      const applicationReviewItem = reviewItem as ApplicationReviewItem;
      return applicationReviewItem.prompt.variants[
        applicationReviewItem.taskParameters.variantIndex
      ];
  }
}

const bottomAreaTranslationAnimationSpec: AnimatedTransitionTiming = {
  type: "spring",
  bounciness: 0,
  speed: 28,
  useNativeDriver: true,
};

const topAreaTranslationAnimationSpec: AnimatedTransitionTiming = {
  ...bottomAreaTranslationAnimationSpec,
  delay: 50,
};

function useAnimatingStyles(
  backIsRevealed: boolean,
): {
  topAreaStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  bottomFrontStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
  bottomBackStyle: Animated.WithAnimatedValue<StyleProp<ViewStyle>>;
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

interface PromptContext {
  title: string;
  url: string | null;
}

function getPromptContext(provenance: PromptProvenance): PromptContext | null {
  switch (provenance.provenanceType) {
    case PromptProvenanceType.Anki:
      return null;
    case PromptProvenanceType.Note:
      return { title: provenance.title, url: provenance.url };
    case PromptProvenanceType.Web:
      return {
        title: provenance.title ?? provenance.siteName ?? provenance.url,
        url: provenance.url,
      };
  }
}

function PromptContextLabel({
  provenance,
  size,
  style,
  accentColor,
}: {
  provenance: PromptProvenance | null;
  size: "regular" | "small";
  style?: FlexStyle;
  accentColor?: string;
}) {
  const promptContext = provenance ? getPromptContext(provenance) : null;

  const color = accentColor ?? colors.ink;
  const numberOfLines = size === "regular" ? 3 : 1;
  return (
    promptContext && (
      <View style={style}>
        {promptContext.url ? (
          <Button
            size={size}
            href={promptContext.url}
            title={promptContext.title}
            color={color}
            numberOfLines={numberOfLines}
            ellipsizeMode="tail"
          />
        ) : (
          <Text
            style={[
              size === "regular"
                ? type.label.layoutStyle
                : type.labelTiny.layoutStyle,
              {
                color,
              },
            ]}
            numberOfLines={numberOfLines}
            ellipsizeMode="tail"
          >
            {promptContext.title}
          </Text>
        )}
      </View>
    )
  );
}

function formatClozePromptContents(
  clozeContents: string,
  isRevealed: boolean,
  clozeIndex: number,
) {
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  let output = "";
  let previousMatchStartIndex = 0;
  let foundSelectedClozeDeletion = false;
  const clozeRegexp = createClozeMarkupRegexp();
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

export interface CardProps {
  reviewItem: ReviewAreaItem;
  backIsRevealed: boolean;

  accentColor?: string;
}

type QAPromptRendererType = CardProps & {
  reviewItem: QAReviewItem | ApplicationReviewItem;
};
function QAPromptRenderer({
  backIsRevealed,
  accentColor,
  reviewItem,
}: QAPromptRendererType) {
  const animatingStyles = useAnimatingStyles(backIsRevealed);
  const spec = getQAPromptContents(reviewItem);

  const [frontSizeVariantIndex, setFrontSizeVariantIndex] = React.useState<
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
        <PromptContextLabel
          provenance={reviewItem.provenance}
          size="small"
          style={styles.topContextLabel}
          accentColor={accentColor}
        />
        <View style={styles.topTextContainer}>
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            largestSizeVariantIndex={
              frontSizeVariantIndex === undefined
                ? undefined
                : frontSizeVariantIndex + 1
            }
            smallestSizeVariantIndex={4}
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
          <View style={styles.bottomContextLabelContainer}>
            <PromptContextLabel
              provenance={reviewItem.provenance}
              size="regular"
              accentColor={accentColor}
            />
          </View>
          <CardField
            promptField={spec.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            onLayout={setFrontSizeVariantIndex}
          />
        </FadeView>
      </View>
    </View>
  );
}

type ClozePromptRendererProps = CardProps & {
  reviewItem: ClozeReviewItem;
};

function ClozePromptRenderer({
  backIsRevealed,
  accentColor,
  reviewItem,
}: ClozePromptRendererProps) {
  const {
    prompt: { body },
    promptParameters: { clozeIndex },
  } = reviewItem;
  const front = {
    ...body,
    contents: formatClozePromptContents(body.contents, false, clozeIndex),
  };
  const back = {
    ...body,
    contents: formatClozePromptContents(body.contents, true, clozeIndex),
  };
  return (
    <View style={styles.cardContainer}>
      <View style={styles.topAreaContainer} />
      <View style={styles.bottomAreaContainer}>
        <View style={styles.bottomContextLabelContainer}>
          <PromptContextLabel
            provenance={reviewItem.provenance}
            size="regular"
            accentColor={accentColor}
          />
        </View>
        <FadeView
          isVisible={backIsRevealed}
          durationMillis={70}
          style={StyleSheet.absoluteFill}
        >
          <CardField
            promptField={back}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            accentColor={accentColor}
          />
        </FadeView>
        <FadeView
          isVisible={!backIsRevealed}
          durationMillis={100}
          style={StyleSheet.absoluteFill}
        >
          <CardField
            promptField={front}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            accentColor={accentColor}
          />
        </FadeView>
      </View>
    </View>
  );
}

export default React.memo(function Card(props: CardProps) {
  const {
    reviewItem: { prompt },
  } = props;
  switch (prompt.promptType) {
    case qaPromptType:
    case applicationPromptType:
      return (
        <QAPromptRenderer
          {...props}
          reviewItem={props.reviewItem as QAReviewItem | ApplicationReviewItem}
        />
      );
    case clozePromptType:
      return (
        <ClozePromptRenderer
          {...props}
          reviewItem={props.reviewItem as ClozeReviewItem}
        />
      );
  }
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
    width: "100%",
  },

  topTextContainer: {
    flex: 1,
    width: "66.67%",
  },

  bottomAreaContainer: {
    flex: 3,
  },

  bottomContextLabelContainer: {
    position: "absolute",
    top: -(200 + layout.gridUnit),
    width: "100%",
    height: 200,
    justifyContent: "flex-end",
  },
});
