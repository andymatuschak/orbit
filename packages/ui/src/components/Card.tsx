import {
  ApplicationPromptTask,
  applicationPromptType,
  ClozePromptTask,
  clozePromptType,
  createClozeMarkupRegexp,
  PromptProvenance,
  PromptProvenanceType,
  QAPrompt,
  QAPromptContents,
  QAPromptTask,
  qaPromptType,
} from "@withorbit/core";
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
      const applicationReviewItem = reviewItem as ReviewAreaItem<
        ApplicationPromptTask
      >;
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
        StyleSheet.absoluteFill,
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
      bottomBackStyle: {
        transform: [
          {
            translateY: bottomAreaTranslateAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [14, 0],
            }),
          },
        ],
      },
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

type PromptProportion = [topProportion: number, bottomProportion: number];
function getProportions(
  contents: QAPromptContents,
): { unrevealed: PromptProportion; revealed: PromptProportion } {
  const questionHasAttachments = contents.question.attachments.length > 0;
  const answerHasAttachments = contents.answer.attachments.length > 0;
  if (!questionHasAttachments && !answerHasAttachments) {
    return { unrevealed: [2, 3], revealed: [2, 3] };
  } else if (questionHasAttachments && !answerHasAttachments) {
    return { unrevealed: [1, 5], revealed: [1, 1] };
  } else if (!questionHasAttachments && answerHasAttachments) {
    return { unrevealed: [2, 3], revealed: [1, 3] };
  } else {
    return { unrevealed: [1, 3], revealed: [1, 2] };
  }
}

export interface CardProps {
  reviewItem: ReviewAreaItem;
  backIsRevealed: boolean;

  accentColor?: string;
}

type QAPromptRendererType = CardProps & {
  reviewItem: ReviewAreaItem<QAPromptTask | ApplicationPromptTask>;
};
function QAPromptRenderer({
  backIsRevealed,
  accentColor,
  reviewItem,
}: QAPromptRendererType) {
  const animatingStyles = useAnimatingStyles(backIsRevealed);
  const contents = getQAPromptContents(reviewItem);

  const [frontSizeVariantIndex, setFrontSizeVariantIndex] = React.useState<
    number | undefined
  >(undefined);

  const proportions = getProportions(contents);

  return (
    <View style={{ flex: 1 }}>
      <FadeView
        isVisible={backIsRevealed}
        durationMillis={100}
        delayMillis={60}
        style={animatingStyles.topAreaStyle}
      >
        <PromptContextLabel
          provenance={reviewItem.provenance}
          size="small"
          style={{
            marginBottom: layout.gridUnit,
          }}
          accentColor={accentColor}
        />
        <View
          style={{
            flex: proportions.revealed[0],
            marginBottom: layout.gridUnit,
            width: "66.67%",
          }}
        >
          <CardField
            promptField={contents.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            largestSizeVariantIndex={
              frontSizeVariantIndex === undefined
                ? undefined
                : frontSizeVariantIndex + 1
            }
            smallestSizeVariantIndex={4}
            colorPalette={reviewItem.colorPalette}
            clipContent
          />
        </View>
        <FadeView
          isVisible={backIsRevealed}
          durationMillis={100}
          style={[
            { flex: proportions.revealed[1] },
            animatingStyles.bottomBackStyle,
          ]}
        >
          <CardField
            promptField={contents.answer}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
          />
        </FadeView>
      </FadeView>
      <FadeView
        style={animatingStyles.bottomFrontStyle}
        isVisible={!backIsRevealed}
        durationMillis={70}
      >
        <View
          style={{
            flex: proportions.unrevealed[0],
            marginTop: layout.gridUnit * 2,
            marginBottom: layout.gridUnit,
            justifyContent: "flex-end",
          }}
        >
          <PromptContextLabel
            provenance={reviewItem.provenance}
            size="regular"
            accentColor={accentColor}
          />
        </View>
        <View style={{ flex: proportions.unrevealed[1] }}>
          <CardField
            promptField={contents.question}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            onLayout={setFrontSizeVariantIndex}
          />
        </View>
      </FadeView>
    </View>
  );
}

type ClozePromptRendererProps = CardProps & {
  reviewItem: ReviewAreaItem<ClozePromptTask>;
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
    <View style={{ flex: 1 }}>
      <View
        style={{
          marginTop: layout.gridUnit * 2,
          flex: 2,
          marginBottom: layout.gridUnit,
          justifyContent: "flex-end",
        }}
      >
        <PromptContextLabel
          provenance={reviewItem.provenance}
          size="regular"
          accentColor={accentColor}
        />
      </View>
      <View style={{ flex: 3 }}>
        <FadeView
          isVisible={backIsRevealed}
          durationMillis={70}
          style={StyleSheet.absoluteFill}
        >
          <CardField
            promptField={back}
            attachmentResolutionMap={reviewItem.attachmentResolutionMap}
            colorPalette={reviewItem.colorPalette}
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
            colorPalette={reviewItem.colorPalette}
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
      return <QAPromptRenderer {...props} reviewItem={props.reviewItem} />;
    case clozePromptType:
      return <ClozePromptRenderer {...props} reviewItem={props.reviewItem} />;
  }
});
