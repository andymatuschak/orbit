import React from "react";
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  TextStyle,
  StyleProp,
} from "react-native";
import { colors, layout, type } from "../styles";
import { ColorPalette } from "../styles/colors";

export const textFieldHorizontalPadding = layout.gridUnit;

export const style = StyleSheet.create({
  base: {
    paddingLeft: textFieldHorizontalPadding,
    paddingRight: textFieldHorizontalPadding,
    paddingTop: layout.gridUnit + type.body.topShift,
    paddingBottom: layout.gridUnit,
    height: layout.gridUnit * 4,
    color: colors.ink,
    borderRadius: layout.borderRadius,
    ...(Platform.OS === "web" && {
      outlineStyle: "none",
    }),
    ...type.body.typeStyle,
  },

  focused: {
    borderWidth: 1,
    paddingLeft: textFieldHorizontalPadding - 1, // avoid shifting the interior due to the border
    // color depends on palette
  },
});

export interface TextInputProps extends RNTextInputProps {
  colorPalette: ColorPalette | null;
}

function useFocusState() {
  const [isFocused, setFocused] = React.useState(false);
  return {
    isFocused,
    onFocus: React.useCallback(() => setFocused(true), []),
    onBlur: React.useCallback(() => setFocused(false), []),
  };
}

export default function TextInput({ colorPalette }: TextInputProps) {
  const { isFocused, onFocus, onBlur } = useFocusState();

  return (
    <RNTextInput
      style={[
        style.base,
        isFocused && style.focused,
        isFocused && {
          borderColor: colorPalette?.accentColor ?? colors.productKeyColor,
        },
        // TODO: establish a neutral secondary background color
        { backgroundColor: colorPalette?.shadeColor ?? colors.white },
      ]}
      // TODO: use secondary text color
      // TODO: establish a neutral secondary text color
      placeholderTextColor={colorPalette?.accentColor ?? colors.ink}
      selectionColor={colorPalette?.accentColor ?? colors.productKeyColor}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
}
