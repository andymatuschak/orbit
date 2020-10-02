import React from "react";
import {
  Alert,
  Animated,
  Easing,
  FlexStyle,
  Linking,
  Platform,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
} from "react-native";
import { colors, layout, type } from "../styles";
import usePrevious from "./hooks/usePrevious";
import Hoverable from "./Hoverable";
import Icon from "./Icon";
import { IconName, IconPosition } from "./IconShared";

export type ButtonPendingActivationState = "hover" | "pressed" | null;

type ButtonContents =
  | { title: string; iconName?: IconName }
  | { iconName: IconName; accessibilityLabel: string };
type ButtonAction =
  | {
      onPress: () => void;
    }
  | { href: string };

export type ButtonProps = ButtonContents &
  ButtonAction & {
    color?: string;
    accentColor?: string; // for the icon; the icon's accent color will be the text color
    backgroundColor?: string;

    disabled?: boolean;
    size?: "regular" | "small";
    hitSlop?: PressableProps["hitSlop"];

    style?: StyleProp<FlexStyle>;

    onPendingInteractionStateDidChange?: (
      pendingActivationState: ButtonPendingActivationState,
    ) => void;

    numberOfLines?: number;
    ellipsizeMode?: TextProps["ellipsizeMode"];
  };

const pressedButtonOpacity = 0.2;
const defaultButtonColor = colors.ink;

const ButtonInterior = function ButtonImpl(
  props: ButtonProps & { isHovered: boolean; isPressed: boolean },
) {
  const {
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

  const isSoloIcon = !("title" in props);
  let iconColor;
  if (disabled) {
    iconColor = color;
  } else if (isSoloIcon) {
    iconColor = color;
  } else {
    iconColor = accentColor;
  }

  return (
    <Animated.View
      style={[
        {
          opacity,
        },
        !!backgroundColor && !isSoloIcon && styles.interiorLayoutWithBackground,
        !!disabled && styles.disabled,
      ]}
      pointerEvents="box-only"
    >
      {iconName && (
        <Icon
          name={iconName}
          position={isSoloIcon ? IconPosition.Center : IconPosition.TopLeft}
          // This is a bit confusing: the button's accent color becomes the icon's tint color; the button's color becomes the icon's accent color. It's intentional, though, to produce an inversion.
          tintColor={iconColor ?? defaultButtonColor}
          accentColor={color ?? defaultButtonColor}
        />
      )}
      {"title" in props && (
        <Text
          {...rest}
          style={[
            (size ?? "regular") === "regular"
              ? type.label.layoutStyle
              : type.labelTiny.layoutStyle,
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
          {props.title}
        </Text>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  interiorLayoutWithBackground: {
    marginTop: layout.gridUnit * 2,
    marginBottom: layout.gridUnit * 2,
    marginLeft: layout.gridUnit * 2,
    marginRight: layout.gridUnit * 2,
  },
  disabled: {
    opacity: 0.3,
    ...(Platform.OS === "web" && { cursor: "not-allowed" }),
  },
  soloIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
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

  const accessibilityLabel =
    "title" in props ? props.title : props.accessibilityLabel;

  const isSoloIcon = !("title" in props);

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
          accessibilityLabel={accessibilityLabel}
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
          style={[
            !!backgroundColor && { backgroundColor },
            isSoloIcon && styles.soloIcon,
            isSoloIcon &&
              isHovered && { borderColor: props.accentColor, borderWidth: 3 },
            style,
          ]}
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
