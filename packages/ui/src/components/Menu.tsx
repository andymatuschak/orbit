import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { layout, colors } from "../styles";
import { ColorPalette } from "../styles/colors";
import Button from "./Button";

export interface MenuProps {
  isVisible: boolean;
  targetRef: React.ElementRef<typeof View>;
  onClose: () => void;
  colorPalette: ColorPalette;
}

interface Measure {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function Menu(props: React.PropsWithChildren<MenuProps>) {
  const { targetRef, colorPalette } = props;
  const [measure, setMeasure] = useState<Measure | null>(null);
  useEffect(() => {
    targetRef.measure((x, y, width, height) =>
      setMeasure({ x, y, width, height }),
    );
  }, [targetRef]);

  return (
    <Modal
      visible={props.isVisible}
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={props.onClose}
    >
      <Pressable
        style={{
          ...StyleSheet.absoluteFillObject,
        }}
        onPressOut={props.onClose}
      >
        {measure && (
          <View
            style={{
              position: "absolute",
              // Hard-coding positioning for now: menu appears below the target ref, aligned right.
              right: measure.x,
              top: measure.y + measure.height + layout.gridUnit,
              borderColor: colorPalette.secondaryTextColor,
              backgroundColor: colorPalette.secondaryBackgroundColor,
              borderWidth: 3,
            }}
          >
            {props.children}
          </View>
        )}
      </Pressable>
    </Modal>
  );
}

export interface MenuItemProps {
  title: string;
  onPress: () => void;
  colorPalette: ColorPalette;
  shortcutKey?: string;
  disabled?: boolean;
}

export default function MenuItem({
  onPress,
  colorPalette,
  shortcutKey,
  disabled,
  title,
}: MenuItemProps) {
  return (
    <Button
      title={title}
      size="small"
      disabled={disabled}
      onPress={onPress}
      backgroundColor={colorPalette.backgroundColor}
      color={colors.white}
    />
  );
}
