import React, { useLayoutEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { colors, layout } from "../styles/index.js";
import { ColorPalette } from "../styles/colors.js";
import Button from "./Button.jsx";
import FadeView from "./FadeView.jsx";
import usePrevious from "./hooks/usePrevious.js";

export interface MenuProps {
  isVisible: boolean;
  targetRef: React.ElementRef<typeof View>;
  items: MenuItemSpec[];
  onClose: () => void;
  colorPalette: ColorPalette;
}

export type MenuItemSpec = {
  title: string;
  action: () => void;
  disabled?: boolean;
};

export const menuItemDividerSpec = {
  title: "__DIVIDER__",
  action: () => {
    return;
  },
};

interface Point {
  x: number;
  y: number;
}

export function Menu({
  colorPalette,
  isVisible,
  items,
  onClose,
  targetRef,
}: React.PropsWithChildren<MenuProps>) {
  const [position, setPosition] = useState<Point | null>(null);
  const [isDisappearing, setDisappearing] = useState(false);
  const wasVisible = usePrevious(isVisible);
  const { width: windowWidth } = useWindowDimensions();
  useLayoutEffect(() => {
    if (isVisible) {
      targetRef.measure((x, y, width, height, pageX, pageY) =>
        setPosition({
          x: windowWidth - pageX - width,
          y: pageY + height + layout.gridUnit,
        }),
      );
    } else if (wasVisible) {
      setDisappearing(true);
    }
  }, [targetRef, isVisible, wasVisible, windowWidth]);

  return (
    <Modal
      visible={isVisible || wasVisible || isDisappearing}
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          ...StyleSheet.absoluteFillObject,
        }}
        onPress={onClose}
      >
        <FadeView
          isVisible={!!position && isVisible}
          durationMillis={isVisible ? 0 : 75}
          onTransitionEnd={(toVisible) => {
            if (!toVisible) {
              setDisappearing(false);
              setPosition(null);
            }
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={
              position && {
                position: "absolute",
                shadowOpacity: 0.22,
                shadowOffset: { width: 0, height: 6 },
                shadowColor: "black",
                shadowRadius: 15,
                borderColor: colorPalette.secondaryTextColor,
                backgroundColor: colorPalette.secondaryBackgroundColor,
                borderWidth: 3,
                // Hard-coding relative positioning for now: menu appears below the target ref, aligned right.
                right: position.x,
                top: position.y,
              }
            }
          >
            {items.map((item, index) =>
              item.title === menuItemDividerSpec.title ? (
                <View
                  key={index}
                  style={{
                    height: 3,
                    backgroundColor: colorPalette.secondaryTextColor,
                  }}
                />
              ) : (
                <MenuItem
                  title={item.title}
                  disabled={item.disabled}
                  key={index}
                  onPress={() => {
                    onClose();
                    item.action();
                  }}
                  colorPalette={colorPalette}
                />
              ),
            )}
          </Pressable>
        </FadeView>
      </Pressable>
    </Modal>
  );
}

interface MenuItemProps {
  title: string;
  onPress: () => void;
  colorPalette: ColorPalette;
  disabled?: boolean;
}

function MenuItem({ onPress, colorPalette, disabled, title }: MenuItemProps) {
  return (
    <Button
      title={title}
      size="small"
      disabled={disabled}
      onPress={onPress}
      backgroundColor={colorPalette.backgroundColor}
      color={colors.white}
      style={{
        paddingLeft: layout.gridUnit * 2,
        paddingRight: layout.gridUnit * 2,
        paddingTop: layout.gridUnit * 2,
        paddingBottom: layout.gridUnit * 2,
      }}
    />
  );
}
