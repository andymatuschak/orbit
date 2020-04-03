import {
  AttachmentURLReference,
  imageAttachmentType,
  PromptField,
} from "metabook-core";
import React from "react";
import { Image, StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";
import { AttachmentResolutionMap } from "../reviewItem";
import { gridUnit } from "../styles/layout";

import typography from "../styles/typography";

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
  return (
    <View style={styles.container}>
      <Markdown style={markdownStyles} mergeStyle={false}>
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

const markdownStyles = StyleSheet.create({
  paragraph: {
    ...typography.cardBodyText,
    marginBottom: typography.cardBodyText.lineHeight / 2.0,
  },
});

const styles = StyleSheet.create({
  container: {
    padding: gridUnit,
    flex: 1,
  },
});
