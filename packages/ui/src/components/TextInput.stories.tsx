import React from "react";
import { TextInputProps, View } from "react-native";
import DebugGrid from "./DebugGrid";
import TextInput from "./TextInput";
import { Story } from "@storybook/react";
import { colors } from "../styles";

export default {
  title: "Controls/TextInput",
  parameters: {
    backgrounds: {
      default: "0",
      values: colors.orderedPaletteNames.map((p, i) => ({
        name: i.toString(),
        value: colors.palettes[p].backgroundColor,
      })),
    },
  },
};

const Template: Story<
  TextInputProps & { colorPaletteIndex?: number; showDebugGrid: boolean }
> = (args) => {
  const [value, setValue] = React.useState("");
  return (
    <View style={{ width: 300, margin: 50 }}>
      {args.showDebugGrid && <DebugGrid />}
      <TextInput
        colorPalette={
          args.colorPaletteIndex === undefined
            ? null
            : colors.palettes[
                colors.orderedPaletteNames[args.colorPaletteIndex]
              ]
        }
        placeholder={args.placeholder}
        value={value}
        onChangeText={setValue}
      />
    </View>
  );
};
Template.args = { placeholder: "Placeholder text", showDebugGrid: false };

export const Basic = Template.bind({});
Basic.args = { ...Template.args, colorPaletteIndex: 0 };
