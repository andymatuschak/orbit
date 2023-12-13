import { Story } from "@storybook/react";
import React from "react";
import { colors } from "../styles/index.js";
import Button, { ButtonProps } from "./Button.jsx";
import { View } from "react-native";
import { IconName } from "./IconShared.js";

const palette = colors.palettes.red;

export default {
  title: "Controls/Button",
  component: Button,
  argTypes: {
    onPress: { action: "pressed" },
    onPendingInteractionStateDidChange: {
      action: "pending interaction state change",
    },
  },
  parameters: {
    backgrounds: {
      values: [{ name: "colorful", value: palette.backgroundColor }],
    },
  },
};

const Template: Story<ButtonProps> = (args) => (
  <View>
    <Button {...args} />
  </View>
);
Template.args = {
  title: "Button",
  accentColor: colors.productKeyColor,
  href: undefined,
  style: { width: 250 },
};

export const Basic = Template.bind({});
Basic.args = Template.args;

export const Link = Template.bind({});
Link.args = {
  ...Template.args,
  onPress: undefined,
  href: "https://google.com",
};

export const Tiny = Template.bind({});
Tiny.args = {
  ...Template.args,
  size: "tiny",
};

export const Disabled = Template.bind({});
Disabled.args = { ...Template.args, disabled: true };

export const IconAndTitle = Template.bind({});
IconAndTitle.args = { ...Template.args, iconName: IconName.Check };

export const Background = Template.bind({});
Background.args = {
  ...IconAndTitle.args,
  accentColor: palette.accentColor,
  backgroundColor: palette.secondaryBackgroundColor,
  color: colors.white,
};
Background.parameters = {
  backgrounds: { default: "colorful" },
};

export const SmallBackground = Template.bind({});
SmallBackground.args = {
  ...Background.args,
  size: "small",
  alignment: "right",
};
SmallBackground.parameters = {
  backgrounds: { default: "colorful" },
};

export const Icon = Template.bind({});
Icon.args = {
  ...Template.args,
  title: "dummy",
  accentColor: palette.accentColor,
  color: colors.white,
  backgroundColor: palette.secondaryBackgroundColor,
  iconName: IconName.ArrowRight,
  style: {},
};
Icon.parameters = {
  backgrounds: { default: "colorful" },
};
delete Icon.args.title;
