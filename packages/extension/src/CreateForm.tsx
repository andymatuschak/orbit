import {
  Button,
  IconName,
  Spacer,
  styles as uiStyles,
  textFieldHorizontalPadding,
  TextInput,
} from "@withorbit/ui";
import { ColorPalette } from "@withorbit/ui/src/styles/colors";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

const { colors, layout, type } = uiStyles;
const colorPalette = colors.palettes.orange;

interface Props {
  onSubmit: (question: string, answer: string) => void;
  isPendingServerResponse: boolean;
  colorPalette: ColorPalette;
}

export default function CreateForm(props: Props) {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");

  const { onSubmit, isPendingServerResponse } = props;

  const onPressSubmit = React.useCallback(() => {
    onSubmit(question, answer);
  }, [onSubmit, question, answer]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Question</Text>
      <Spacer units={1} />
      <TextInput
        // @ts-ignore
        style={styles.textInput}
        colorPalette={colorPalette}
        onChangeText={setQuestion}
        value={question}
        placeholder="Question"
        returnKeyType="next"
        multiline
      />
      <Spacer units={2} />
      <Text style={styles.label}>Answer</Text>
      <Spacer units={1} />
      <TextInput
        // @ts-ignore
        style={styles.textInput}
        colorPalette={colorPalette}
        onChangeText={setAnswer}
        value={answer}
        placeholder="Answer"
        returnKeyType="done"
        onSubmitEditing={onPressSubmit}
        multiline
      />
      <Spacer units={2} />
      <View style={{ position: "relative" }}>
        <Button
          color={colors.white}
          accentColor={colorPalette.accentColor}
          iconName={IconName.ArrowRight}
          title="Create"
          onPress={onPressSubmit}
        />
        <View style={styles.indicatorContainer}>
          <ActivityIndicator
            animating={true}
            color={colorPalette.accentColor}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: "100%",
    width: "100%",
    justifyContent: "center",
    backgroundColor: colorPalette.backgroundColor,
    padding: layout.edgeMargin,
  },

  textInput: {
    marginLeft: -textFieldHorizontalPadding,
    marginRight: -textFieldHorizontalPadding,
    height: "100%",
  },

  // @ts-ignore
  label: {
    ...type.labelSmall.layoutStyle,
    color: colors.white,
  },

  indicatorContainer: {
    position: "absolute",
    right: 0,
    bottom: layout.gridUnit * 2,
  },
});
