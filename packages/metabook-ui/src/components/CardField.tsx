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
  TextStyle,
  View,
} from "react-native";
import Markdown, * as MarkdownDisplay from "react-native-markdown-display";
import { AttachmentResolutionMap } from "../reviewItem";
import { gridUnit } from "../styles/layout";

import typography from "../styles/typography";

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
    () => ({
      body: function MarkdownRoot(node, children, parent, styles) {
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
    }),
    [],
  );

  const markdownStyles = useMemo(() => getMarkdownStyles(shrinkFactor), [
    shrinkFactor,
  ]);

  return (
    <View style={styles.container} onLayout={onContainerLayout}>
      <Markdown rules={renderRules} style={markdownStyles} mergeStyle={false}>
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
