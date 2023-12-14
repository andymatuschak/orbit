import isEqual from "lodash.isequal";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ColorValue,
  Image,
  LayoutChangeEvent,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import * as MarkdownDisplay from "react-native-markdown-display";

import { colors, type, layout } from "../styles/index.js";
import { getVariantStyles } from "../styles/type.js";
import usePrevious from "./hooks/usePrevious.js";
import useWeakRef from "./hooks/useWeakRef.js";
import { useMarkdownItInstance } from "./PromptFieldRenderer/markdown.js";
import {
  renderBlockMath,
  renderInlineMath,
} from "./PromptFieldRenderer/markdownLatexSupport.js";
import { SawtoothPattern } from "./SawtoothPattern.jsx";
import { AttachmentID, TaskContentField } from "@withorbit/core";

const sizeVariantCount = 5;
const defaultSmallestSizeVariant = 4;

// @ts-ignore react-native-markdown-display is using an older version of @react/types, which is causing a type-checking conflict. But I promise it's OK.
const Markdown: React.ComponentType<
  React.PropsWithChildren<MarkdownDisplay.MarkdownProps>
> = MarkdownDisplay.default;

interface SizeVariant {
  style: TextStyle;
  maximumLineCount?: number;
}

const sizeVariants: SizeVariant[] = [
  { style: type.promptXXLarge.layoutStyle, maximumLineCount: 1 },
  { style: type.promptXLarge.layoutStyle, maximumLineCount: 1 },
  { style: type.promptLarge.layoutStyle, maximumLineCount: 4 },
  { style: type.promptMedium.layoutStyle },
  { style: type.promptSmall.layoutStyle },
];

function getMarkdownStyles(
  sizeVariant: SizeVariant,
  accentColor: ColorValue,
): StyleSheet.NamedStyles<unknown> {
  const paragraphStyle = sizeVariant.style;
  if (!paragraphStyle) {
    throw new Error("Unknown shrink factor");
  }
  const paragraphSpacingStyle = { marginBottom: paragraphStyle.lineHeight! };
  const listSpacingStyle = { marginBottom: paragraphStyle.lineHeight! / 2.0 };
  const listIconStyle = {
    ...paragraphStyle,
    marginLeft: paragraphStyle.lineHeight! / 3.0,
    marginRight: paragraphStyle.lineHeight! / 3.0,
  };
  return {
    textgroup: paragraphStyle,
    math_block: paragraphStyle,
    bullet_list_icon: listIconStyle,
    ordered_list_icon: listIconStyle,

    paragraph: {},
    paragraphSpacing: paragraphSpacingStyle,
    list_item: {
      ...listSpacingStyle,
      flexDirection: "row",
      justifyContent: "flex-start",
    },
    bullet_list: listSpacingStyle,
    ordered_list: listSpacingStyle,

    code_inline: {
      ...Platform.select({
        ios: {
          fontFamily: "Courier",
        },
        android: {
          fontFamily: "monospace",
        },
        web: {
          fontFamily: "monospace",
          letterSpacing: "-0.05em",
        },
      }),
    },

    fence: {
      ...paragraphStyle,
      ...Platform.select({
        ios: {
          fontFamily: "Courier",
        },
        android: {
          fontFamily: "monospace",
        },
        web: {
          fontFamily: "monospace",
          letterSpacing: "-0.05em",
        },
      }),
    },

    clozeHighlight: {
      color: accentColor,
    },
    clozeUnderlineContainer: {
      height: paragraphStyle.lineHeight,
      width: paragraphStyle.fontSize! * 3,
      ...(Platform.OS === "web" && { display: "inline-block" }),
    },
    clozeUnderline:
      Platform.OS === "web"
        ? {
            display: "inline-block",
            width: "100%",
            height: 3,
            backgroundColor: accentColor,
          }
        : {
            // HACK: rough positioning...
            top: paragraphStyle.lineHeight! + (paragraphStyle.top! as number),
            height: 3,
            backgroundColor: accentColor,
          },
  };
}

function WebClozeUnderline(props: {
  containerStyle: StyleProp<ViewStyle>;
  underlineStyle: StyleProp<ViewStyle>;
}) {
  return (
    <Text style={props.containerStyle}>
      <Text style={props.underlineStyle} />
    </Text>
  );
}

function NativeClozeUnderline(props: {
  containerStyle: StyleProp<ViewStyle>;
  underlineStyle: StyleProp<ViewStyle>;
}) {
  return (
    <View style={props.containerStyle}>
      <View style={props.underlineStyle} />
    </View>
  );
}

const ClozeUnderline =
  Platform.OS === "web" ? WebClozeUnderline : NativeClozeUnderline;

const getMarkdownRenderRules = (
  onLayout: (event: LayoutChangeEvent) => void,
): MarkdownDisplay.RenderRules => ({
  body(node, children, _parent, styles) {
    return (
      <View key={node.key} style={styles._VIEW_SAFE_body} onLayout={onLayout}>
        {children}
      </View>
    );
  },
  clozeHighlight(node, children, _parent, styles, inheritedStyles = {}) {
    return (
      <Text key={node.key} style={[styles.clozeHighlight, inheritedStyles]}>
        {children}
      </Text>
    );
  },

  paragraph(node, children, parent, styles) {
    return (
      <View
        key={node.key}
        style={[
          styles._VIEW_SAFE_paragraph,
          styles.paragraph,
          parent[0].children[parent[0].children.length - 1] !== node &&
            styles.paragraphSpacing,
        ]}
      >
        {children}
      </View>
    );
  },

  text(node, _children, _parent, styles, inheritedStyles = {}) {
    const parsedChildren: React.ReactNode[] = [];
    let content = node.content as string;
    for (
      let clozeTokenIndex = content.indexOf(clozeBlankSentinel);
      clozeTokenIndex !== -1;
      clozeTokenIndex = content.indexOf(clozeBlankSentinel)
    ) {
      const prefix = content.slice(0, clozeTokenIndex);
      if (prefix.length > 0) {
        parsedChildren.push(prefix);
      }

      content = content.slice(clozeTokenIndex);
      parsedChildren.push(
        <ClozeUnderline
          key={clozeTokenIndex}
          containerStyle={styles.clozeUnderlineContainer}
          underlineStyle={styles.clozeUnderline}
        />,
      );
      content = content.slice(clozeBlankSentinel.length);
    }
    if (content.length > 0) {
      parsedChildren.push(content);
    }

    return (
      <Text
        key={node.key}
        style={[
          inheritedStyles,
          getVariantStyles(
            inheritedStyles.fontFamily,
            inheritedStyles.fontWeight === "bold",
            inheritedStyles.fontStyle === "italic",
          ),
        ]}
      >
        {parsedChildren}
      </Text>
    );
  },

  math_inline: renderInlineMath,
  math_inline_double: renderInlineMath,

  math_block: renderBlockMath,
});

function useImageSize(
  imageURL: string | null,
  containerSize: { width: number; height: number } | null,
): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  useEffect(() => {
    setSize(null);
    if (imageURL) {
      Image.getSize(
        imageURL,
        (width, height) => setSize({ width, height }),
        (error) => {
          console.error(`Couldn't get size for image at ${imageURL}: ${error}`);
        },
      );
    }
  }, [imageURL]);

  return useMemo(() => {
    if (containerSize && size !== null) {
      const ratio = size.width / size.height;
      const height = Math.min(
        containerSize.width / ratio,
        0.8 * containerSize.height,
      );
      return { width: height * ratio, height };
    } else {
      return null;
    }
  }, [containerSize, size]);
}

function useImageURL(
  contentField: TaskContentField,
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>,
): string | null {
  const [imageURL, setImageURL] = useState<string | null>(null);
  const pendingContentField = useRef<TaskContentField | null>(null);

  const _getURLForAttachmentID = useWeakRef(getURLForAttachmentID);
  useEffect(() => {
    setImageURL(null);
    pendingContentField.current = contentField;
    const attachmentID = contentField.attachments[0];
    if (attachmentID) {
      _getURLForAttachmentID.current(attachmentID).then((url) => {
        if (
          pendingContentField.current === null ||
          contentField !== pendingContentField.current
        ) {
          return;
        }

        if (!url) {
          // TODO: recover more gracefully, show UI indicating it's missing...
          throw new Error(`Missing attachment ${attachmentID}`);
        }

        setImageURL(url);
      });
    }

    return () => {
      pendingContentField.current = null;
    };
  }, [_getURLForAttachmentID, contentField]);

  return imageURL;
}

export default React.memo(function PromptFieldRenderer(props: {
  promptField: TaskContentField;
  getURLForAttachmentID: (id: AttachmentID) => Promise<string | null>;

  colorPalette?: colors.ColorPalette;
  clipContent?: boolean;

  onLayout?: (sizeVariant: number) => void;
  largestSizeVariantIndex?: number;
  smallestSizeVariantIndex?: number; // TODO: use better types.
}) {
  const {
    promptField,
    getURLForAttachmentID,
    colorPalette,
    onLayout,
    largestSizeVariantIndex,
    smallestSizeVariantIndex,
  } = props;

  const effectiveLargestSizeVariantIndex = Math.min(
    largestSizeVariantIndex ?? 0,
    sizeVariantCount - 1,
  );

  const [sizeVariantIndex, setSizeVariantIndex] = useState(
    effectiveLargestSizeVariantIndex,
  );
  const [isLayoutReady, setLayoutReady] = useState(false);
  const [markdownHeight, setMarkdownHeight] = useState<number | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const previousPromptField = usePrevious(promptField);
  // Reset shrink factor when prompt field changes.
  if (previousPromptField && !isEqual(promptField, previousPromptField)) {
    setSizeVariantIndex((sizeVariantIndex) => {
      const newIndex = effectiveLargestSizeVariantIndex;
      if (sizeVariantIndex !== newIndex) {
        setMarkdownHeight(null);
        setLayoutReady(false);
      }
      return newIndex;
    });
  }
  useLayoutEffect(() => {
    setSizeVariantIndex((sizeVariantIndex) =>
      Math.max(effectiveLargestSizeVariantIndex, sizeVariantIndex),
    );
  }, [effectiveLargestSizeVariantIndex]);

  const imageURL = useImageURL(promptField, getURLForAttachmentID);
  const imageSize = useImageSize(imageURL, containerSize);
  useLayoutEffect(() => {
    if (
      markdownHeight !== null &&
      containerSize !== null &&
      !(imageURL && !imageSize) && // i.e. wait until image is sized if there is one
      containerSize.height > 0 // When the node is removed from the display list, its layout is reset to 0.
    ) {
      setSizeVariantIndex((sizeVariantIndex) => {
        const renderedHeight =
          markdownHeight + (imageSize ? imageSize.height + layout.gridUnit : 0);
        const sizeVariant = sizeVariants[sizeVariantIndex]!;
        if (
          (renderedHeight > containerSize.height ||
            (sizeVariant.maximumLineCount &&
              markdownHeight / sizeVariant.style.lineHeight! >
                sizeVariant.maximumLineCount)) &&
          sizeVariantIndex <
            (smallestSizeVariantIndex ?? defaultSmallestSizeVariant)
        ) {
          setLayoutReady(false);
          return sizeVariantIndex + 1;
        } else {
          setLayoutReady(true);
          return sizeVariantIndex;
        }
      });
    }
  }, [
    markdownHeight,
    containerSize,
    imageURL,
    imageSize,
    smallestSizeVariantIndex,
  ]);

  const sizeVariantRef = useWeakRef(sizeVariantIndex);
  useEffect(() => {
    onLayout?.(sizeVariantRef.current);
  }, [isLayoutReady, onLayout, sizeVariantRef]);

  const effectiveAccentColor = colorPalette?.accentColor ?? colors.ink;
  const markdownItInstance = useMarkdownItInstance(true);

  const shouldClipContent = (() => {
    if (!markdownHeight) return false;
    if (!containerSize?.height) return false;
    if (!colorPalette) return false;
    return markdownHeight > containerSize.height;
  })();

  const effectiveOverflowColor = colorPalette?.backgroundColor ?? colors.ink;
  const effectiveSawteethBorderColor = colorPalette?.secondaryTextColor;

  return (
    <View
      style={{
        flex: 1,
        opacity: isLayoutReady ? 1 : 0,
        overflow: isLayoutReady && !shouldClipContent ? "visible" : "hidden",
        justifyContent: "space-between",
      }}
      onLayout={useCallback((event: LayoutChangeEvent) => {
        setContainerSize(event.nativeEvent.layout);
      }, [])}
    >
      <View
        style={{
          height: isLayoutReady ? undefined : 10000,
        }}
      >
        <Markdown
          rules={useMemo(
            () =>
              getMarkdownRenderRules((event) =>
                setMarkdownHeight(event.nativeEvent.layout.height),
              ),
            [],
          )}
          style={useMemo(
            () =>
              getMarkdownStyles(
                sizeVariants[sizeVariantIndex],
                effectiveAccentColor,
              ),
            [effectiveAccentColor, sizeVariantIndex],
          )}
          mergeStyle={false}
          markdownit={markdownItInstance}
        >
          {promptField.text}
        </Markdown>
      </View>
      {shouldClipContent && (
        <View
          style={{ position: "absolute", bottom: 0, left: 0, width: "100%" }}
        >
          <SawtoothPattern
            fillColor={effectiveOverflowColor}
            strokeColor={effectiveSawteethBorderColor}
            teethWidth={layout.gridUnit * 3}
            teethHeight={layout.gridUnit}
          />
          <View
            style={{
              height: layout.gridUnit,
              width: "100%",
              backgroundColor: effectiveOverflowColor,
            }}
          />
        </View>
      )}
      {imageURL && imageSize && (
        <Image
          source={{ uri: imageURL }}
          style={{ ...imageSize, flexShrink: 0, marginTop: layout.gridUnit }}
          onError={({ nativeEvent: { error } }) =>
            console.warn(`Error displaying image`, error)
          }
        />
      )}
    </View>
  );
});

export const clozeBlankSentinel = "zqzCLOZEzqz";
