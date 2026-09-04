import {
  AttachmentID,
  ClozeTaskContent,
  ClozeTaskContentComponent,
  QATaskContent,
  TaskContentType,
  TaskProvenance,
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
import { ReviewAreaItem } from "../reviewAreaItem.js";
import { colors, layout, type } from "../styles/index.js";
import Button from "./Button.jsx";
import FadeView from "./FadeView.jsx";
import {
  AnimatedTransitionTiming,
  useTransitioningValue,
} from "./hooks/useTransitioningValue.js";
import CardField, { clozeBlankSentinel } from "./PromptFieldRenderer.js";
import {
  clozeEndHighlightSentinel,
  clozeStartHighlightSentinel,
} from "./PromptFieldRenderer/clozeHighlightPlugin.js";

function getQAPromptContents<TC extends QATaskContent | ClozeTaskContent>(
  reviewItem: ReviewAreaItem<TC>,
): QATaskContent {
  switch (reviewItem.spec.content.type) {
    case TaskContentType.QA:
      // This cast should not be needed... My IDE does not throw any error
      // without the cast, but TSC throws:
      // `Type 'TC' is not assignable to type 'QATaskContent'`.
      // casting resolves the type issue...
      return reviewItem.spec.content as QATaskContent;
    case TaskContentType.Cloze:
      throw new Error("cloze prompt is not a QA prompt");
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

function useAnimatingStyles(backIsRevealed: boolean): {
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

function PromptContextLabel({
  provenance,
  size,
  style,
  accentColor,
}: {
  provenance: TaskProvenance | null;
  size: "regular" | "small";
  style?: FlexStyle;
  accentColor?: string;
}) {
  const color = accentColor ?? colors.ink;
  const numberOfLines = size === "regular" ? 3 : 1;
  return provenance?.title ? (
    <View style={style}>
      {provenance.url ? (
        <Button
          size={size === "regular" ? "regular" : "tiny"}
          href={provenance.url}
          title={provenance.title}
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
          {provenance.title}
        </Text>
      )}
    </View>
  ) : null;
}

function formatClozePromptContents(
  text: string,
  component: ClozeTaskContentComponent,
  isRevealed: boolean,
) {
  let mutatingText: string = text;
  for (const range of component.ranges) {
    if (isRevealed) {
      mutatingText =
        mutatingText.slice(0, range.startIndex) +
        clozeStartHighlightSentinel +
        mutatingText.slice(range.startIndex, range.startIndex + range.length) +
        clozeEndHighlightSentinel +
        mutatingText.slice(range.startIndex + range.length);
    } else {
      mutatingText =
        mutatingText.slice(0, range.startIndex) +
        clozeBlankSentinel +
        mutatingText.slice(range.startIndex + range.length);
    }
  }
  return mutatingText;
}

type PromptProportion = [topProportion: number, bottomProportion: number];
function getProportions(contents: QATaskContent): {
  unrevealed: PromptProportion;
  revealed: PromptProportion;
} {
  const questionHasAttachments = contents.body.attachments.length > 0;
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
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;

  accentColor?: string;
}

type QAPromptRendererType = Omit<CardProps, "reviewItem"> & {
  reviewItem: ReviewAreaItem<QATaskContent>;
};

function QAPromptRenderer({
  backIsRevealed,
  accentColor,
  reviewItem,
  getURLForAttachmentID,
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
            promptField={contents.body}
            getURLForAttachmentID={getURLForAttachmentID}
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
            getURLForAttachmentID={getURLForAttachmentID}
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
            promptField={contents.body}
            getURLForAttachmentID={getURLForAttachmentID}
            onLayout={setFrontSizeVariantIndex}
          />
        </View>
      </FadeView>
    </View>
  );
}

type ClozePromptRendererProps = Omit<CardProps, "reviewItem"> & {
  reviewItem: ReviewAreaItem<ClozeTaskContent>;
};

function ClozePromptRenderer({
  backIsRevealed,
  accentColor,
  reviewItem,
  getURLForAttachmentID,
}: ClozePromptRendererProps) {
  const {
    componentID,
    spec: {
      content: { body, components },
    },
  } = reviewItem;
  const front = {
    ...body,
    text: formatClozePromptContents(body.text, components[componentID], false),
  };
  const back = {
    ...body,
    text: formatClozePromptContents(body.text, components[componentID], true),
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
            getURLForAttachmentID={getURLForAttachmentID}
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
            getURLForAttachmentID={getURLForAttachmentID}
            colorPalette={reviewItem.colorPalette}
          />
        </FadeView>
      </View>
    </View>
  );
}

export default React.memo(function Card(props: CardProps) {
  switch (props.reviewItem.spec.content.type) {
    case TaskContentType.QA:
      return (
        <QAPromptRenderer
          {...props}
          reviewItem={props.reviewItem as ReviewAreaItem<QATaskContent>}
        />
      );
    case TaskContentType.Cloze:
      return (
        <ClozePromptRenderer
          {...props}
          reviewItem={props.reviewItem as ReviewAreaItem<ClozeTaskContent>}
        />
      );
    case TaskContentType.Plain:
      throw new Error("A plain task content type renderer does not exist yet");
  }
});
