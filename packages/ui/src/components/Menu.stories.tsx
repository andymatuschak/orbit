import { Story } from "@storybook/react";
import React, { useRef, useState } from "react";
import { View } from "react-native";
import { colors } from "../styles/index.js";
import Button from "./Button.js";
import { IconName } from "./IconShared.js";
import { LogoProps } from "./LogoShared.js";
import { Menu, menuItemDividerSpec } from "./Menu.js";

export default {
  title: "Menu",
  component: Menu,
};

function noop() {
  return;
}

const Template: Story<LogoProps> = (args) => {
  const buttonRef = useRef<View | null>(null);
  const [menuIsVisible, setMenuIsVisible] = useState(false);
  return (
    <View
      style={{
        backgroundColor: colors.palettes.red.backgroundColor,
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
      }}
    >
      <View ref={buttonRef}>
        <Button
          onPress={() => setMenuIsVisible(true)}
          iconName={IconName.List}
          accessibilityLabel="Show menu"
          color={colors.palettes.red.accentColor}
        />
      </View>
      {buttonRef.current && (
        <Menu
          {...args}
          isVisible={menuIsVisible}
          targetRef={buttonRef.current}
          onClose={() => setMenuIsVisible(false)}
          colorPalette={colors.palettes.red}
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
    </View>
  );
};
Template.args = {};

export const Basic = Template.bind({});
Basic.args = { ...Template.args };
