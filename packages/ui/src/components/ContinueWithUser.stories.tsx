import { Story } from "@storybook/react";
import React from "react";
import { View } from "react-native";
import { colors } from "../styles/index.js";
import ContinueWithUser from "./ContinueWithUser.jsx";

export default {
  title: "ContinueWithUser",
  component: ContinueWithUser,
};

const Template: Story<{
  colorPaletteIndex: number;
  email: string;
}> = (args) => {
  const colorPalette =
    colors.palettes[colors.orderedPaletteNames[args.colorPaletteIndex]];

  const handleContinueWithUser = () => {
    console.log("Continue with user!");
  };

  return (
    <View
      style={{
        height: "100%",
        backgroundColor: colorPalette.backgroundColor,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <ContinueWithUser
        colorPalette={colorPalette}
        email={args.email}
        onContinueWithUser={handleContinueWithUser}
      />
    </View>
  );
};

Template.args = {
  colorPaletteIndex: 5,
  email: "test@test.com",
};

export const Basic = Template.bind({});
Basic.args = { ...Template.args };
