import React, { useLayoutEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { colors, layout } from "../styles";
import { ColorPalette } from "../styles/colors";
import Button from "./Button";
import FadeView from "./FadeView";
import usePrevious from "./hooks/usePrevious";

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
};

export const menuItemDividerSpec = {
  title: "__DIVIDER__",
  action: () => {
    return;
  },
};

interface Measure {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Menu({
  colorPalette,
  isVisible,
  items,
  onClose,
  targetRef,
}: React.PropsWithChildren<MenuProps>) {
  const [measure, setMeasure] = useState<Measure | null>(null);
  const [isDisappearing, setDisappearing] = useState(false);
  const wasVisible = usePrevious(isVisible);
  useLayoutEffect(() => {
    if (isVisible) {
      targetRef.measure((x, y, width, height) =>
        setMeasure({ x, y, width, height }),
      );
    } else if (wasVisible) {
      setDisappearing(true);
    }
  }, [targetRef, isVisible, wasVisible]);

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
          isVisible={!!measure && isVisible}
          durationMillis={isVisible ? 0 : 75}
          onTransitionEnd={(toVisible) => {
            if (!toVisible) {
              setDisappearing(false);
              setMeasure(null);
            }
          }}
        >
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={
              measure && {
                position: "absolute",
                shadowOpacity: 0.22,
                shadowOffset: { width: 0, height: 6 },
                shadowColor: "black",
                shadowRadius: 15,
                borderColor: colorPalette.secondaryTextColor,
                backgroundColor: colorPalette.secondaryBackgroundColor,
                borderWidth: 3,
                padding: layout.gridUnit * 0.5,
                // Hard-coding relative positioning for now: menu appears below the target ref, aligned right.
                right: measure.x,
                top: measure.y + measure.height + layout.gridUnit,
              }
            }
          >
            {items.map((item, index) =>
              item.title === menuItemDividerSpec.title ? (
                <View
                  style={{
                    height: 3,
                    marginLeft: -layout.gridUnit * 0.5,
                    marginRight: -layout.gridUnit * 0.5,
                    marginTop: layout.gridUnit * 0.5,
                    marginBottom: layout.gridUnit * 0.5,
                    backgroundColor: colorPalette.secondaryTextColor,
                  }}
                />
              ) : (
                <MenuItem
                  title={item.title}
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
        paddingLeft: layout.gridUnit * 1.5,
        paddingRight: layout.gridUnit * 1.5,
        paddingTop: layout.gridUnit * 1.5,
        paddingBottom: layout.gridUnit * 1.5,
      }}
    />
  );
}
