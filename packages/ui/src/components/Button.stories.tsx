import { Meta, StoryObj } from "@storybook/react";
import { colors } from "../styles/index.js";
import Button from "./Button.jsx";
import { IconName } from "./IconShared.js";

const palette = colors.palettes.red;

const meta = {
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
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;
const Template: Story = {
  args: {
    title: "Button",
    onPress: () => {
      alert("button pressed");
    },
    accentColor: colors.productKeyColor,
    style: { width: 250 },
  },
};

export const Basic = {
  args: {
    ...Template.args,
  },
} satisfies Story;

export const Link = {
  args: {
    ...Template.args,
    href: "https://google.com",
  },
} satisfies Story;

export const Tiny = {
  args: {
    ...Template.args,
    size: "tiny",
  },
} satisfies Story;

export const Disabled = {
  args: { ...Template.args, disabled: true },
} satisfies Story;

export const IconAndTitle = {
  args: { ...Template.args, iconName: IconName.Check },
} satisfies Story;

export const Background = {
  args: {
    ...IconAndTitle.args,
    accentColor: palette.accentColor,
    backgroundColor: palette.secondaryBackgroundColor,
    color: colors.white,
  },
} satisfies Story;

export const SmallBackground = {
  args: {
    ...Background.args,
    size: "small",
    alignment: "right",
  },
} satisfies Story;

export const Icon = {
  args: {
    ...Template.args,
    title: "",
    accentColor: palette.accentColor,
    color: colors.white,
    backgroundColor: palette.secondaryBackgroundColor,
    iconName: IconName.ArrowRight,
  },
  parameters: {
    backgrounds: { default: "colorful" },
  },
} satisfies Story;
