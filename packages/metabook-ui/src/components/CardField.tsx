import isEqual from "lodash.isequal";
import MarkdownIt, { Delimiter } from "markdown-it/lib";
import Token from "markdown-it/lib/token";
import {
  AttachmentURLReference,
  imageAttachmentType,
  PromptField,
} from "metabook-core";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
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
import Markdown, * as MarkdownDisplay from "react-native-markdown-display";
import { AttachmentResolutionMap } from "../reviewItem";

import { colors, type } from "../styles";
import { getVariantStyles } from "../styles/type";
import usePrevious from "./hooks/usePrevious";
import useWeakRef from "./hooks/useWeakRef";

function clozeParsePlugin(md: MarkdownIt) {
  const startDelimiterCode = "{".charCodeAt(0);
  const endDelimiterCode = "}".charCodeAt(0);
  md.inline.ruler.before("emphasis", "clozeHighlight", (state, silent) => {
    if (silent) {
      return false;
    }

    const marker = state.src.charCodeAt(state.pos);
    if (!(marker === startDelimiterCode || marker === endDelimiterCode)) {
      return false;
    }

    const scanned = state.scanDelims(state.pos, true);
    if (scanned.length !== 1) {
      return false;
    }

    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);

    state.delimiters.push({
      marker: marker,
      length: scanned.length,
      jump: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
      level: 0,
    });

    state.pos += scanned.length;
    return true;
  });

  md.inline.ruler2.after("emphasis", "clozeHighlight", (state) => {
    const clozeHighlightWasActive = state.env.clozeHighlightActive;
    const allDelimiters = [
      state.delimiters,
      ...state.tokens_meta.map(
        (m: { delimiters: Delimiter[] }) => m?.delimiters ?? [],
      ),
    ].reduce<Delimiter[]>((all, current) => all.concat(current), []);

    const startDelimiter = allDelimiters.find(
      (delimiter) => delimiter.marker === startDelimiterCode,
    );
    if (startDelimiter) {
      state.tokens.splice(
        startDelimiter.token,
        1,
        new Token("clozeHighlight_open", "clozeHighlight", 1),
      );
      state.env.clozeHighlightActive = true;
    }

    const endDelimiter = allDelimiters.find(
      (delimiter) => delimiter.marker === endDelimiterCode,
    );
    if (endDelimiter) {
      state.tokens.splice(
        endDelimiter.token,
        1,
        new Token("clozeHighlight_close", "clozeHighlight", -1),
      );
      state.env.clozeHighlightActive = false;
    } else if (state.env.clozeHighlightActive) {
      state.tokens.splice(
        state.tokens.length,
        0,
        new Token("clozeHighlight_close", "clozeHighlight", -1),
      );
    }

    if (clozeHighlightWasActive) {
      state.tokens.splice(
        0,
        0,
        new Token("clozeHighlight_open", "clozeHighlight", 1),
      );
    }
  });
}

const markdownItInstance = MarkdownDisplay.MarkdownIt({
  typographer: true,
}).use(clozeParsePlugin);

const sizeVariantCount = 5;
const defaultSmallestSizeVariant = 4;

interface SizeVariant {
  style: TextStyle;
  maximumLineCount?: number;
}

const sizeVariants: SizeVariant[] = [
  { style: type.displayLarge.layoutStyle, maximumLineCount: 1 },
  { style: type.display.layoutStyle, maximumLineCount: 2 },
  { style: type.headline.layoutStyle },
  { style: type.body.layoutStyle },
  { style: type.bodySmall.layoutStyle },
  { style: type.caption.layoutStyle },
];

function getMarkdownStyles(sizeVariant: SizeVariant, accentColor: ColorValue) {
  const paragraphStyle = sizeVariant.style;
  if (!paragraphStyle) {
    throw new Error("Unknown shrink factor");
  }
  return {
    textgroup: paragraphStyle,
    paragraph: {},
    paragraphSpacing: { marginTop: paragraphStyle.lineHeight! },
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

function getMarkdownRenderRules(
  setMarkdownHeight: (value: number) => void,
): MarkdownDisplay.RenderRules {
  return {
    body: function MarkdownRootRenderer(node, children, parent, styles) {
      return (
        <View
          key={node.key}
          style={styles._VIEW_SAFE_body}
          onLayout={(event) =>
            setMarkdownHeight(event.nativeEvent.layout.height)
          }
        >
          {children}
        </View>
      );
    },
    clozeHighlight: function MarkdownClozeRenderer(
      node,
      children,
      parent,
      styles,
      inheritedStyles = {},
    ) {
      return (
        <Text key={node.key} style={[styles.clozeHighlight, inheritedStyles]}>
          {children}
        </Text>
      );
    },

    paragraph: function MarkdownTextRenderer(node, children, parent, styles) {
      return (
        <View
          key={node.key}
          style={[
            styles._VIEW_SAFE_paragraph,
            styles.paragraph,
            parent[0].children[0] !== node && styles.paragraphSpacing,
          ]}
        >
          {children}
        </View>
      );
    },

    text: function MarkdownTextRenderer(
      node,
      children,
      parent,
      styles,
      inheritedStyles = {},
    ) {
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
            styles.text,
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
  };
}

export default React.memo(function CardField(props: {
  promptField: PromptField;
  attachmentResolutionMap: AttachmentResolutionMap | null;

  accentColor?: ColorValue;

  onLayout?: (sizeVariant: number) => void;
  largestSizeVariantIndex?: number;
  smallestSizeVariantIndex?: number; // TODO: use better types.
}) {
  const {
    promptField,
    attachmentResolutionMap,
    onLayout,
    accentColor,
    largestSizeVariantIndex,
    smallestSizeVariantIndex,
  } = props;

  const effectiveLargestSizeVariantIndex = Math.min(
    largestSizeVariantIndex ?? 0,
    sizeVariantCount - 1,
  );

  let imageURL: string | null = null;
  if (promptField.attachments.length > 0 && attachmentResolutionMap) {
    const images = promptField.attachments.filter(
      (reference) => reference.type === imageAttachmentType,
    );
    const imageURLReferences = images
      .map((reference) => attachmentResolutionMap.get(reference.id))
      .filter<AttachmentURLReference>((r): r is AttachmentURLReference => !!r);
    if (imageURLReferences.length > 0) {
      imageURL = imageURLReferences[0].url;
    }
  }

  const [sizeVariantIndex, setSizeVariantIndex] = useState(
    effectiveLargestSizeVariantIndex,
  );
  const [isLayoutReady, setLayoutReady] = useState(false);
  const previousPromptField = usePrevious(promptField);
  // Reset shrink factor when prompt field changes.
  if (previousPromptField && !isEqual(promptField, previousPromptField)) {
    setSizeVariantIndex((sizeVariantIndex) => {
      const newIndex = effectiveLargestSizeVariantIndex;
      if (sizeVariantIndex !== newIndex) {
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

  const [markdownHeight, setMarkdownHeight] = useState<number | null>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (markdownHeight !== null && containerHeight !== null) {
      setSizeVariantIndex((sizeVariantIndex) => {
        const sizeVariant = sizeVariants[sizeVariantIndex]!;
        if (
          (markdownHeight > containerHeight ||
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
  }, [markdownHeight, containerHeight, smallestSizeVariantIndex]);

  const sizeVariantRef = useWeakRef(sizeVariantIndex);
  useEffect(() => {
    onLayout?.(sizeVariantRef.current);
  }, [isLayoutReady, onLayout, sizeVariantRef]);

  const onContainerLayout = useCallback(
    (event: LayoutChangeEvent) =>
      setContainerHeight(event.nativeEvent.layout.height),
    [],
  );

  const effectiveAccentColor = accentColor ?? colors.ink;
  const renderRules = useMemo<MarkdownDisplay.RenderRules>(
    () => getMarkdownRenderRules(setMarkdownHeight),
    [],
  );

  const markdownStyles = useMemo(
    () =>
      getMarkdownStyles(sizeVariants[sizeVariantIndex], effectiveAccentColor),
    [effectiveAccentColor, sizeVariantIndex],
  );

  return (
    <View
      style={{
        flex: 1,
        opacity: isLayoutReady ? 1 : 0,
        overflow: isLayoutReady ? "visible" : "hidden",
      }}
      onLayout={onContainerLayout}
    >
      <View style={{ height: isLayoutReady ? undefined : 10000 }}>
        <Markdown
          rules={renderRules}
          style={markdownStyles as StyleSheet.NamedStyles<unknown>}
          mergeStyle={false}
          markdownit={markdownItInstance}
        >
          {promptField.contents}
        </Markdown>
      </View>
      {imageURL && (
        <Image
          source={{ uri: imageURL }}
          style={{
            ...StyleSheet.absoluteFillObject,
            zIndex: -1,
            resizeMode: "contain",
          }}
          onError={({ nativeEvent: { error } }) =>
            console.warn(`Error displaying image`, error)
          }
        />
      )}
    </View>
  );
});

export const clozeBlankSentinel = "zqzCLOZEzqz";
