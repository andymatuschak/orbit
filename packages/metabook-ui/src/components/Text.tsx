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

export const DisplayLarge = makeTextComponent(
  type.displayLarge.layoutStyle,
  "DisplayLarge",
);
export const Display = makeTextComponent(type.display.layoutStyle, "Display");
export const Title = makeTextComponent(type.title.layoutStyle, "Title");
export const Headline = makeTextComponent(
  type.headline.layoutStyle,
  "Headline",
);
export const Body = makeTextComponent(type.body.layoutStyle, "Body");
export const BodySmall = makeTextComponent(
  type.bodySmall.layoutStyle,
  "BodySmall",
);
export const Label = makeTextComponent(type.label.layoutStyle, "Label");
export const Caption = makeTextComponent(type.caption.layoutStyle, "Caption");
