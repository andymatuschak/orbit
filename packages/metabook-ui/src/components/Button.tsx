import React from "react";
import {
  Alert,
  Animated,
  ColorValue,
  Easing,
  FlexStyle,
  Linking,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  ViewProps,
} from "react-native";
import { colors, type, layout } from "../styles";
import usePrevious from "./hooks/usePrevious";
import Hoverable from "./Hoverable";
import Icon, { IconName, IconPosition } from "./Icon";

export type ButtonPendingActivationState = "hover" | "pressed" | null;
export type ButtonProps = {
  title: string;
  color?: ColorValue;
  disabled?: boolean;
  size?: "regular" | "small";
  hitSlop?: ViewProps["hitSlop"];

  iconName?: IconName;
  accentColor?: ColorValue;

  style?: StyleProp<FlexStyle>;

  onPendingInteractionStateDidChange?: (
    pendingActivationState: ButtonPendingActivationState,
  ) => void;

  numberOfLines?: number;
  ellipsizeMode?: TextProps["ellipsizeMode"];
} & (
  | {
      onPress: () => void;
    }
  | { href: string }
);

const pressedButtonOpacity = 0.2;
const defaultButtonColor = colors.ink;

const ButtonImpl = React.memo(function ButtonImpl(
  props: ButtonProps & { isHovered: boolean; isPressed: boolean },
) {
  const {
    title,
    color,
    disabled,
    size,
    iconName,
    accentColor,
    isHovered,
    isPressed,
    style,
    ...rest
  } = props;
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
      pointerEvents="box-only"
    >
      {iconName && (
        <Icon
          name={iconName}
          position={IconPosition.TopLeft}
          // This is a bit confusing: the button's accent color becomes the icon's tint color; the button's color becomes the icon's accent color. It's intentional, though, to produce an inversion.
          tintColor={(disabled ? color : accentColor) ?? defaultButtonColor}
          accentColor={color ?? defaultButtonColor}
        />
      )}
      <Text
        {...rest}
        style={[
          (size ?? "regular") === "regular"
            ? type.label.layoutStyle
            : type.caption.layoutStyle,
          ,
          {
            color:
              ((isHovered || isPressed) && accentColor && !disabled
                ? accentColor
                : color) || defaultButtonColor,
          },
        ]}
        selectable={false}
        suppressHighlighting={true}
      >
        {title}
      </Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.3,
  },
});

export default function Button(props: ButtonProps) {
  const { onPendingInteractionStateDidChange } = props;

  const href = "href" in props ? props.href : null;
  const onPress = "onPress" in props ? props.onPress : null;
  const effectiveOnPress = React.useMemo(
    () =>
      onPress ??
      (() => {
        console.log("Opening url");
        Linking.openURL(href!).catch(() => {
          Alert.alert(
            "Couldn't open link",
            `You may need to install an app to open this URL: ${href}`,
          );
        });
      }),
    [href, onPress],
  );

  const isPressed = React.useRef(false);
  const isHovered = React.useRef(false);
  const lastDispatchedPendingInteractionState = React.useRef<
    ButtonPendingActivationState
  >(null);

  const dispatchPendingInteractionState = React.useCallback(() => {
    const activationState = isPressed.current
      ? "pressed"
      : isHovered.current
      ? "hover"
      : null;
    if (lastDispatchedPendingInteractionState.current !== activationState) {
      lastDispatchedPendingInteractionState.current = activationState;
      onPendingInteractionStateDidChange?.(activationState);
    }
  }, [isPressed, isHovered, onPendingInteractionStateDidChange]);
  const onPressIn = React.useCallback(() => {
    isPressed.current = true;
    dispatchPendingInteractionState();
  }, [isPressed, dispatchPendingInteractionState]);
  const onPressOut = React.useCallback(() => {
    isPressed.current = false;
    dispatchPendingInteractionState();
  }, [isPressed, dispatchPendingInteractionState]);
  const onHoverIn = React.useCallback(() => {
    isHovered.current = true;
    dispatchPendingInteractionState();
  }, [isHovered, dispatchPendingInteractionState]);
  const onHoverOut = React.useCallback(() => {
    isHovered.current = false;
    dispatchPendingInteractionState();
  }, [isHovered, dispatchPendingInteractionState]);

  return (
    <Hoverable onHoverIn={onHoverIn} onHoverOut={onHoverOut}>
      {(isHovered) => (
        <Pressable
          accessible={true}
          accessibilityRole={href ? "link" : "button"}
          accessibilityLabel={props.title}
          onPress={effectiveOnPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          disabled={props.disabled}
          // @ts-ignore react-native-web adds this prop.
          href={href}
          hitSlop={props.hitSlop}
        >
          {({ pressed }) => (
            <ButtonImpl {...props} isHovered={isHovered} isPressed={pressed} />
          )}
        </Pressable>
      )}
    </Hoverable>
  );
}
