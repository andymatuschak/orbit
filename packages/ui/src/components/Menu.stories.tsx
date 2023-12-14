import { Meta, StoryObj } from "@storybook/react";
import React, { useRef, useState } from "react";
import { View } from "react-native";
import { colors } from "../styles/index.js";
import { colorPaletteArgType } from "./__fixtures__/colorPaletteArgType.js";
import Button from "./Button.jsx";
import { IconName } from "./IconShared.js";
import { Menu, menuItemDividerSpec } from "./Menu.jsx";

const MenuStory = ({ colorPalette }: { colorPalette: colors.ColorPalette }) => {
  const buttonRef = useRef<View | null>(null);
  const [menuIsVisible, setMenuIsVisible] = useState(false);
  return (
    <div
      style={{
        backgroundColor: colorPalette.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        display: "flex",
      }}
    >
      <View ref={buttonRef}>
        <Button
          onPress={() => setMenuIsVisible(true)}
          iconName={IconName.List}
          accessibilityLabel="Show menu"
          color={colorPalette.accentColor}
        />
      </View>
      {buttonRef.current && (
        <Menu
          isVisible={menuIsVisible}
          targetRef={buttonRef.current}
          onClose={() => setMenuIsVisible(false)}
          colorPalette={colorPalette}
          items={[
            { title: "Undo", action: noop },
            menuItemDividerSpec,
            { title: "Delete Prompt", action: noop },
            { title: "Visit Prompt Origin", action: noop },
            menuItemDividerSpec,
            { title: "Exit Review", action: noop },
          ]}
        />
      )}
    </div>
  );
};

const meta = {
  title: "Menu",
  component: MenuStory,
  argTypes: {
    colorPalette: colorPaletteArgType,
  },
} satisfies Meta<typeof MenuStory>;
export default meta;

type Story = StoryObj<typeof meta>;

function noop() {
  return;
}

export const Basic = {
  args: { colorPalette: colors.palettes.red },
} satisfies Story;
