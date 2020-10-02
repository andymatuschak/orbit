import React from "react";
import { View } from "react-native";
import { ink, productKeyColor } from "../styles/colors";
import Icon from "./Icon";
import { IconName, IconPosition, IconProps, iconSize } from "./IconShared";

export default {
  title: "Style/Icons",
  component: Icon,
};

function IconSwatch(props: IconProps) {
  return (
    <View
      style={{
        width: iconSize,
        height: iconSize,
        backgroundColor: "#f0f0f0",
        margin: 8,
      }}
    >
      <Icon {...props} />
    </View>
  );
}

function IconEntry(props: { iconName: IconName }) {
  const sharedProps = {
    name: props.iconName,
    tintColor: productKeyColor,
    accentColor: ink,
  };

  return (
    <View style={{ flexDirection: "row" }}>
      <IconSwatch {...sharedProps} position={IconPosition.TopLeft} />
      <IconSwatch {...sharedProps} position={IconPosition.TopRight} />
      <IconSwatch {...sharedProps} position={IconPosition.BottomLeft} />
      <IconSwatch {...sharedProps} position={IconPosition.BottomRight} />
      <IconSwatch {...sharedProps} position={IconPosition.Center} />
    </View>
  );
}

export function Index() {
  return (
    <View>
      <IconEntry iconName={IconName.Check} />
      <IconEntry iconName={IconName.Cross} />
      <IconEntry iconName={IconName.Reveal} />
      <IconEntry iconName={IconName.ArrowRight} />
    </View>
  );
}
