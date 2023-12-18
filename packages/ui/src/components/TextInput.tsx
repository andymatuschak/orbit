import React from "react";
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  TextStyle,
  StyleProp,
} from "react-native";
import { colors, layout, type } from "../styles/index.js";
import { ColorPalette } from "../styles/colors.js";

export const textFieldHorizontalPadding = layout.gridUnit;

const styles = StyleSheet.create({
  base: {
    paddingLeft: textFieldHorizontalPadding,
    paddingRight: textFieldHorizontalPadding,
    paddingTop: layout.gridUnit + type.label.topShift,
    paddingBottom: layout.gridUnit,
    height: layout.gridUnit * 4,
    color: colors.ink,
    borderRadius: layout.borderRadius,
    ...(Platform.OS === "web" && {
      outlineStyle: "none",
    }),
    ...type.label.typeStyle,
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

function useFocusState(initialState: boolean) {
  const [isFocused, setFocused] = React.useState(initialState);
  return {
    isFocused,
    onFocus: React.useCallback(() => setFocused(true), []),
    onBlur: React.useCallback(() => setFocused(false), []),
  };
}

const TextInput = React.forwardRef<RNTextInput, TextInputProps>(
  function TextInput(props: TextInputProps, ref) {
    const { colorPalette, ...rest } = props;
    const { isFocused, onFocus, onBlur } = useFocusState(!!props.autoFocus);

    let style: StyleProp<TextStyle> = [
      styles.base,
      isFocused && styles.focused,
      isFocused && {
        borderColor: colorPalette?.accentColor ?? colors.productKeyColor,
      },
      // TODO: establish a neutral secondary background color
      {
        backgroundColor: colorPalette?.secondaryBackgroundColor ?? colors.white,
      },
    ];
    if (props.style) {
      style = [style, props.style];
    }

    return (
      <RNTextInput
        {...rest}
        ref={ref}
        style={style}
        // TODO: establish a neutral secondary text color
        placeholderTextColor={colorPalette?.secondaryTextColor ?? colors.ink}
        selectionColor={colorPalette?.accentColor ?? colors.productKeyColor}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    );
  },
);
export default TextInput;
