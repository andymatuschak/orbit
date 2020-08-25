import React from "react";
import { View } from "react-native";
import { colors } from "../styles";
import { ink, productKeyColor } from "../styles/colors";
import Icon, { IconName, IconPosition } from "./Icon";

export default {
  title: "Style/Icons",
  component: Icon,
};

function IconEntry(props: { iconName: IconName }) {
  const iconStyle = { borderWidth: 1, borderColor: "black", margin: 8 };

  const sharedProps = {
    name: props.iconName,
    style: iconStyle,
    tintColor: productKeyColor,
    accentColor: ink,
  };

  return (
    <View style={{ flexDirection: "row" }}>
      <Icon {...sharedProps} position={IconPosition.TopLeft} />
      <Icon {...sharedProps} position={IconPosition.TopRight} />
      <Icon {...sharedProps} position={IconPosition.BottomLeft} />
      <Icon {...sharedProps} position={IconPosition.BottomRight} />
    </View>
  );
}

export function Index() {
  return (
    <View>
      <IconEntry iconName={IconName.Check} />
      <IconEntry iconName={IconName.Cross} />
      <IconEntry iconName={IconName.Reveal} />
    </View>
  );
}
