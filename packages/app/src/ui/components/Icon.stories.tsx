import type { Meta, StoryObj } from "@storybook/react-webpack5";
import React from "react";
import { View } from "react-native";
import { ink, productKeyColor } from "../styles/colors.js";
import Icon from "./Icon.jsx";
import { IconName, IconPosition, IconProps, iconSize } from "./IconShared.js";

const meta = {
  title: "Style/Icons",
  component: Icon,
} satisfies Meta<typeof Icon>;
export default meta;

type Story = StoryObj<typeof IndexStory>;

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

function IndexStory() {
  return (
    <View>
      <IconEntry iconName={IconName.Check} />
      <IconEntry iconName={IconName.Cross} />
      <IconEntry iconName={IconName.Reveal} />
      <IconEntry iconName={IconName.ArrowRight} />
      <IconSwatch
        name={IconName.Menu}
        position={IconPosition.Center}
        tintColor={productKeyColor}
      />
    </View>
  );
}

export const Index = {
  render: IndexStory,
} satisfies Story;
