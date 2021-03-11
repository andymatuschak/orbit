import React from "react";
import { Platform, StyleProp, Text, TextStyle } from "react-native";

export interface LinkProps {
  href: string;
  style?: StyleProp<TextStyle>;
}

export default function Link({
  children,
  style,
  href,
}: React.PropsWithChildren<LinkProps>) {
  if (Platform.OS !== "web") {
    throw new Error("Link is unimplemented outside web");
  }

  return (
    <Text
      accessibilityRole="link"
      // @ts-ignore RN types lack RNW href.
      href={href}
      style={React.useMemo(
        () => [
          {
            color: "inherit",
            textDecorationLine: "underline",
          },
          style,
        ],
        [style],
      )}
    >
      <Text>{children}</Text>
    </Text>
  );
}
