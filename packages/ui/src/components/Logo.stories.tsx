import { Meta, StoryObj } from "@storybook/react";
import { colors } from "../styles/index.js";
import Logo from "./Logo.jsx";

const meta = {
  title: "Logo",
  component: Logo,
  args: {
    tintColor: colors.productKeyColor,
  },
} satisfies Meta<typeof Logo>;
export default meta;

type Story = StoryObj<typeof meta>;
export const Basic = {
  args: { units: 2 },
} satisfies Story;
