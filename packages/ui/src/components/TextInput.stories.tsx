import { Meta, StoryObj } from "@storybook/react";
import React from "react";
import { View } from "react-native";
import { colors } from "../styles/index.js";
import { colorPaletteArgType } from "./__fixtures__/colorPaletteArgType.js";
import TextInput from "./TextInput.jsx";

const meta: Meta<typeof TextInput> = {
  title: "Controls/TextInput",
  component: TextInput,
  argTypes: {
    colorPalette: colorPaletteArgType,
  },
  decorators: [
    (Story, context) => {
      const [value, setValue] = React.useState("");
      return (
        <View
          style={{
            width: 300,
            padding: 50,
            backgroundColor: context.args.colorPalette?.backgroundColor,
          }}
        >
          <Story onChangeText={setValue} value={value} />
        </View>
      );
    },
  ],
} satisfies Meta<typeof TextInput>;
export default meta;

export const Basic = {
  args: { colorPalette: colors.palettes.red },
} satisfies StoryObj<typeof meta>;
