import MarkdownIt, { Delimiter } from "markdown-it/lib";
import Token from "markdown-it/lib/token";
import {
  AttachmentURLReference,
  imageAttachmentType,
  PromptField,
} from "metabook-core";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TextStyle,
  View,
} from "react-native";
import Markdown, * as MarkdownDisplay from "react-native-markdown-display";
import { AttachmentResolutionMap } from "../reviewItem";
import colors from "../styles/colors";
import { gridUnit } from "../styles/layout";

import typography from "../styles/typography";
import NamedStyles = StyleSheet.NamedStyles;

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
    if (state.clozeHighlightActive) {
      state.tokens.splice(
        0,
        0,
        new Token("clozeHighlight_open", "clozeHighlight", 0),
      );
    }
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
        new Token("clozeHighlight_open", "clozeHighlight", 0),
      );
      state.clozeHighlightActive = true;
    }

    const endDelimiter = allDelimiters.find(
      (delimiter) => delimiter.marker === endDelimiterCode,
    );
    if (endDelimiter) {
      state.tokens.splice(
        endDelimiter.token,
        1,
        new Token("clozeHighlight_close", "clozeHighlight", 0),
      );
      state.clozeHighlightActive = false;
    } else if (state.clozeHighlightActive) {
      state.tokens.splice(
        state.tokens.length - 1,
        0,
        new Token("clozeHighlight_close", "clozeHighlight", 0),
      );
    }
  });
}

function getMarkdownStyles(shrinkFactor: number) {
  let paragraphStyles: TextStyle;
  switch (shrinkFactor) {
    case 0:
      paragraphStyles = typography.cardBodyText;
      break;
    case 1:
      paragraphStyles = typography.smallCardBodyText;
      break;
    case 2:
      paragraphStyles = typography.smallestCardBodyText;
      break;
    default:
      throw new Error("Unknown shrink factor");
  }
  paragraphStyles.marginBottom = paragraphStyles.lineHeight! / 2.0;
  return {
    paragraph: paragraphStyles,
    clozeHighlight: {
      color: colors.key50,
      fontWeight: "bold",
    },
  };
}

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
          <Text
            key={clozeTokenIndex}
            style={{
              color: "transparent",
              backgroundColor: colors.key30,
              borderRadius: 4,
              marginLeft: 1,
              marginRight: 1,
            }}
          >
            {"__________"}
          </Text>,
        );
        content = content.slice(clozeBlankSentinel.length);
      }
      if (content.length > 0) {
        parsedChildren.push(content);
      }
      return (
        <Text key={node.key} style={[styles.text, inheritedStyles]}>
          {parsedChildren}
        </Text>
      );
    },
  };
}

export default React.memo(function CardField(props: {
  promptField: PromptField;
  attachmentResolutionMap: AttachmentResolutionMap | null;
}) {
  const { promptField, attachmentResolutionMap } = props;
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

  const [shrinkFactor, setShrinkFactor] = useState(0);
  // Reset shrink factor when prompt field changes.
  useEffect(() => {
    setShrinkFactor(0);
  }, [promptField]);

  const [markdownHeight, setMarkdownHeight] = useState<number | null>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  useEffect(() => {
    if (markdownHeight && containerHeight && markdownHeight > containerHeight) {
      setShrinkFactor((shrinkFactor) => Math.min(shrinkFactor + 1, 2));
    }
  }, [markdownHeight, containerHeight]);

  const onContainerLayout = useCallback(
    (event: LayoutChangeEvent) =>
      setContainerHeight(event.nativeEvent.layout.height),
    [],
  );

  const renderRules = useMemo<MarkdownDisplay.RenderRules>(
    () => getMarkdownRenderRules(setMarkdownHeight),
    [],
  );

  const markdownStyles = useMemo(() => getMarkdownStyles(shrinkFactor), [
    shrinkFactor,
  ]);

  const plugins = useMemo(
    () => [new MarkdownDisplay.PluginContainer(clozeParsePlugin)],
    [],
  );

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <Markdown
        rules={renderRules}
        style={markdownStyles as NamedStyles<unknown>}
        mergeStyle={false}
        plugins={plugins}
      >
        {promptField.contents}
      </Markdown>
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

const styles = StyleSheet.create({
  container: {
    padding: gridUnit,
    flex: 1,
    overflow: "scroll",
  },
});

export const clozeBlankSentinel = "zqzCLOZEzqz";
