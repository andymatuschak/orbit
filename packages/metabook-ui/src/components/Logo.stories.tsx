import React from "react";
import { Story } from "@storybook/react";
import Logo, { LogoProps } from "./Logo";
import { colors } from "../styles";

export default {
  title: "Logo",
};

const Template: Story<LogoProps> = (args) => <Logo {...args} />;
Template.args = { style: { tintColor: colors.productKeyColor } };

export const Basic = Template.bind({});
Basic.args = { ...Template.args, size: 16 };
