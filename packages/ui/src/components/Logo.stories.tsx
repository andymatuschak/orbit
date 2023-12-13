import React from "react";
import { Story } from "@storybook/react";
import Logo from "./Logo.jsx";
import { colors } from "../styles/index.js";
import { LogoProps } from "./LogoShared.js";

export default {
  title: "Logo",
};

const Template: Story<LogoProps> = (args) => <Logo {...args} />;
Template.args = { tintColor: colors.productKeyColor };

export const Basic = Template.bind({});
Basic.args = { ...Template.args, units: 2 };
