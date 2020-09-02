import React from "react";
import {
  Alert,
  Animated,
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
import { colors, layout, type } from "../styles";
import usePrevious from "./hooks/usePrevious";
import Hoverable from "./Hoverable";
import Icon, { IconName, IconPosition } from "./Icon";

export type ButtonPendingActivationState = "hover" | "pressed" | null;
export type ButtonProps = {
  title: string;

  color?: string;
  accentColor?: string; // for the icon; the icon's accent color will be the text color
  backgroundColor?: string;

  disabled?: boolean;
  size?: "regular" | "small";
  hitSlop?: ViewProps["hitSlop"];

  iconName?: IconName;

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

const ButtonInterior = function ButtonImpl(
  props: ButtonProps & { isHovered: boolean; isPressed: boolean },
) {
  const {
    title,
    color,
    accentColor,
    backgroundColor,
    disabled,
    size,
    iconName,
    isHovered,
    isPressed,
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
      style={[
        {
          opacity,
        },
        styles.interiorLayout,
        !!backgroundColor && styles.interiorLayoutWithBackground,
        !!disabled && styles.disabled,
      ]}
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
};

const styles = StyleSheet.create({
  interiorLayout: {
    marginTop: layout.gridUnit * 2,
    marginBottom: layout.gridUnit * 2,
  },
  interiorLayoutWithBackground: {
    marginLeft: layout.gridUnit * 2,
    marginRight: layout.gridUnit * 2,
  },
  disabled: {
    opacity: 0.3,
    cursor: "not-allowed",
  },
});

export default React.memo(function Button(props: ButtonProps) {
  const { onPendingInteractionStateDidChange, backgroundColor, style } = props;

  const href = "href" in props ? props.href : null;
  const onPress = "onPress" in props ? props.onPress : null;

  const isPressed = React.useRef(false);
  const isHovered = React.useRef(false);
  const lastDispatchedPendingInteractionState = React.useRef<
    ButtonPendingActivationState
  >(null);

  function dispatchPendingInteractionState() {
    const activationState = isPressed.current
      ? "pressed"
      : isHovered.current
      ? "hover"
      : null;
    if (lastDispatchedPendingInteractionState.current !== activationState) {
      lastDispatchedPendingInteractionState.current = activationState;
      onPendingInteractionStateDidChange?.(activationState);
    }
  }

  return (
    <Hoverable
      onHoverIn={() => {
        isHovered.current = true;
        dispatchPendingInteractionState();
      }}
      onHoverOut={() => {
        isHovered.current = false;
        dispatchPendingInteractionState();
      }}
    >
      {(isHovered) => (
        <Pressable
          accessible={true}
          accessibilityRole={href ? "link" : "button"}
          accessibilityLabel={props.title}
          onPress={
            onPress ??
            (() => {
              Linking.openURL(href!).catch(() => {
                Alert.alert(
                  "Couldn't open link",
                  `You may need to install an app to open this URL: ${href}`,
                );
              });
            })
          }
          onPressIn={() => {
            isPressed.current = true;
            dispatchPendingInteractionState();
          }}
          onPressOut={() => {
            isPressed.current = false;
            dispatchPendingInteractionState();
          }}
          disabled={props.disabled}
          // @ts-ignore react-native-web adds this prop.
          href={href}
          hitSlop={props.hitSlop}
          style={[!!backgroundColor && { backgroundColor }, style]}
        >
          {({ pressed }) => (
            <ButtonInterior
              {...props}
              isHovered={isHovered}
              isPressed={pressed}
            />
          )}
        </Pressable>
      )}
    </Hoverable>
  );
});
