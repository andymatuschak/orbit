import React from "react";
import {
  Animated,
  ColorValue,
  Easing,
  FlexStyle,
  Pressable,
  StyleProp,
  StyleSheet,
} from "react-native";
import { layout, colors } from "../styles";
import usePrevious from "./hooks/usePrevious";
import Hoverable from "./Hoverable";
import Icon, { IconName, IconPosition } from "./Icon";
import { Label } from "./Text";

export interface ButtonProps {
  title: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;

  iconName?: IconName;
  accentColor?: ColorValue;

  style?: StyleProp<FlexStyle>;
}

const pressedButtonOpacity = 0.2;
const defaultButtonColor = colors.ink;

const ButtonImpl = React.memo(function ButtonImpl({
  title,
  color,
  disabled,
  iconName,
  accentColor,
  isHovered,
  isPressed,
  style,
}: ButtonProps & { isHovered: boolean; isPressed: boolean }) {
  const opacity = React.useRef(new Animated.Value(1)).current;
  const wasPressed = usePrevious(isPressed);
  if (wasPressed && !isPressed) {
    Animated.timing(opacity, {
      easing: Easing.linear,
      duration: 100,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  } else if (!wasPressed && isPressed) {
    opacity.setValue(pressedButtonOpacity);
  }

  return (
    <Animated.View
      style={React.useMemo(
        () => [
          style,
          {
            opacity,
          },
          !!disabled && styles.disabled,
        ],
        [disabled, opacity, style],
      )}
    >
      {iconName && (
        <Icon
          name={iconName}
          position={IconPosition.TopLeft}
          tintColor={(disabled ? color : accentColor) || defaultButtonColor}
        />
      )}
      <Label
        selectable={false}
        color={
          ((isHovered || isPressed) && accentColor && !disabled
            ? accentColor
            : color) || defaultButtonColor
        }
      >
        {title}
      </Label>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.3,
  },
});

export default function Button(props: ButtonProps) {
  return (
    <Hoverable>
      {(isHovered) => (
        <Pressable
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={props.title}
          onPress={props.onPress}
          disabled={props.disabled}
        >
          {({ pressed }) => (
            <ButtonImpl {...props} isHovered={isHovered} isPressed={pressed} />
          )}
        </Pressable>
      )}
    </Hoverable>
  );
}
