import React, { PropsWithChildren } from "react";
import { ColorValue, Text, TextProps, TextStyle, View } from "react-native";
import * as type from "../styles/type";

interface TextElementProps {
  style?: TextStyle;
  color?: ColorValue;
  selectable?: boolean;
  numberOfLines?: number;
  ellipsizeMode?: TextProps["ellipsizeMode"];
  accessibilityRole?: TextProps["accessibilityRole"];
  href?: string;
}

function makeTextComponent(
  layoutStyle: TextStyle,
  name: string,
): React.ComponentType<TextElementProps> {
  const component = ({
    children,
    color,
    selectable,
    style,
    ...rest
  }: PropsWithChildren<TextElementProps>) => (
    <View style={style}>
      <Text
        style={[layoutStyle, !!color && { color: color }]}
        selectable={selectable ?? true}
        suppressHighlighting={!selectable}
        {...rest}
      >
        {children}
      </Text>
    </View>
  );
  component.displayName = name;
  return React.memo(component);
}
