import React from "react";
import { View } from "react-native";
import Icon, { IconName, IconPosition } from "./Icon";

export default {
  title: "Style/Icons",
  component: Icon,
};

function IconEntry(props: { iconName: IconName }) {
  const iconStyle = { borderWidth: 1, borderColor: "black", margin: 8 };
  return (
    <View style={{ flexDirection: "row" }}>
      <Icon
        name={props.iconName}
        position={IconPosition.TopLeft}
        style={iconStyle}
      />
      <Icon
        name={props.iconName}
        position={IconPosition.TopRight}
        style={iconStyle}
      />
      <Icon
        name={props.iconName}
        position={IconPosition.BottomLeft}
        style={iconStyle}
      />
      <Icon
        name={props.iconName}
        position={IconPosition.BottomRight}
        style={iconStyle}
      />
    </View>
  );
}

export function Index() {
  return (
    <View>
      <IconEntry iconName={IconName.Check} />
    </View>
  );
}
