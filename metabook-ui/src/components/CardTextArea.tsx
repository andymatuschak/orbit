import React from "react";
import { StyleSheet, View } from "react-native";
import Markdown from "react-native-markdown-display";

import typography from "../styles/typography";

export default React.memo(function CardTextArea(props: { children: string }) {
  return (
    <View>
      <Markdown
        style={styles}
        mergeStyle={false}
      >
        {props.children}
      </Markdown>
    </View>
  );
});

const styles = StyleSheet.create({
  paragraph: {
    ...typography.cardBodyText,
    marginBottom: typography.cardBodyText.lineHeight / 2.0,
  },
});
