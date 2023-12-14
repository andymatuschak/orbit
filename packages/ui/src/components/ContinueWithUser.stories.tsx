import { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { orderedPaletteNames } from "../styles/colors.js";
import { colors } from "../styles/index.js";
import ContinueWithUser from "./ContinueWithUser.jsx";

const meta: Meta<typeof ContinueWithUser> = {
  title: "ContinueWithUser",
  component: ContinueWithUser,
  argTypes: {
    colorPalette: {
      options: orderedPaletteNames,
      mapping: Object.fromEntries(
        orderedPaletteNames.map((name) => [name, colors.palettes[name]]),
      ),
    },
  },
  decorators: [
    (Story, context) => (
      <div
        style={{
          height: "100vh",
          backgroundColor: context.args.colorPalette.backgroundColor,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof meta>;

export const Basic = {
  args: {
    colorPalette: colors.palettes.red,
    onContinueWithUser: () => {
      alert("Continue");
    },
    email: "test@test.com",
  },
} satisfies Story;
