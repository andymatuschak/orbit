import React from "react";
import {
  Animated,
  Easing,
  FlexStyle,
  Pressable,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { layout } from "../styles";
import usePrevious from "./hooks/usePrevious";
import Hoverable from "./Hoverable";
import Icon, { IconName, IconPosition } from "./Icon";
import { Label } from "./Text";
import WithAnimatedValue = Animated.WithAnimatedValue;

export interface ButtonProps {
  title: string;
  onPress: () => void;
  textColor?: string;

  iconName?: IconName;
  accentColor?: string;

  style?: StyleProp<FlexStyle>;
}

const pressedButtonOpacity = 0.2;

const ButtonImpl = React.memo(function ButtonImpl({
  title,
  textColor,
  iconName,
  accentColor,
  isHovered,
  isPressed,
  ...rest
}: ButtonProps & { isHovered: boolean; isPressed: boolean }) {
  const [opacity] = React.useState(new Animated.Value(1));
  const wasPressed = usePrevious(isPressed);
  if (wasPressed && !isPressed) {
    Animated.timing(opacity, {
      easing: Easing.linear,
      duration: 150,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  } else if (!wasPressed && isPressed) {
    opacity.setValue(pressedButtonOpacity);
  }

  return (
    <Animated.View
      {...rest}
      style={
        StyleSheet.compose(rest.style, ({
          opacity,
        } as unknown) as StyleProp<ViewStyle>) as WithAnimatedValue<
          StyleProp<ViewStyle>
        > // HACK: Taking advantage of the fact that StyleSheet.compose can work with animated values, even though its type doesn't claim it can.
      }
    >
      {iconName && (
        <Icon
          name={iconName}
          position={IconPosition.BottomLeft}
          style={{
            tintColor: accentColor,
            marginBottom: layout.gridUnit,
          }}
        />
      )}
      <Label
        selectable={false}
        color={
          (isHovered || isPressed) && accentColor ? accentColor : textColor
        }
      >
        {title}
      </Label>
    </Animated.View>
  );
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
        >
          {({ pressed }) => (
            <ButtonImpl {...props} isHovered={isHovered} isPressed={pressed} />
          )}
        </Pressable>
      )}
    </Hoverable>
  );
}
