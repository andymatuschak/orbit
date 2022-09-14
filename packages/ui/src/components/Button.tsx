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
  View,
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
    focusOnMount?: boolean;
  };

// const pressedButtonOpacity = 0.2;
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
    // opacity.setValue(pressedButtonOpacity);
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

  const backgroundOpacity = isPressed || isHovered ? 1 : 0;

  return (
    <View
      style={[
        disabled && {
          opacity: 0.3,
          ...(Platform.OS === "web" && { cursor: "not-allowed" }),
        },
        isSoloIcon && {
          alignItems: "center",
          justifyContent: "center",
          flex: 1,
        },
      ]}
    >
      {backgroundColor && (
        <>
          <View
            style={[
              StyleSheet.absoluteFill,
              isSoloIcon && styles.soloIcon,
              { backgroundColor, opacity: backgroundOpacity },
            ]}
          />
          {isPressed && (
            <View
              style={[
                StyleSheet.absoluteFill,
                isSoloIcon && styles.soloIcon,
                { backgroundColor: "rgba(92, 56, 0, 0.14);" },
              ]}
            />
          )}
          {isSoloIcon && isHovered && (
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.soloIcon,
                {
                  borderColor: props.accentColor,
                  borderWidth: 3,
                },
              ]}
            />
          )}
        </>
      )}
      <Animated.View
        style={[
          {
            opacity,
          },
          !!backgroundColor &&
            !isSoloIcon && {
              margin: layout.gridUnit * 2,
            },
        ]}
      >
        {iconName && (
          <Icon
            name={iconName}
            position={isSoloIcon ? IconPosition.Center : IconPosition.TopLeft}
            // This is a bit confusing: the button's accent color becomes the icon's tint color; the button's text color becomes the icon's accent color. It's intentional, though, to produce an inversion.
            tintColor={iconColor ?? defaultButtonColor}
            accentColor={
              // HACK
              color === iconColor ? colors.ink : color ?? defaultButtonColor
            }
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
                color: color ?? defaultButtonColor,
              },
            ]}
            selectable={false}
            suppressHighlighting={true}
          >
            {props.title}
          </Text>
        )}
      </Animated.View>
    </View>
  );
};

// HACK lazy copy/pasta for demo
const SmallButtonInterior = function SmallButtonImpl(
  props: ButtonProps & { isHovered: boolean; isPressed: boolean },
) {
  const {
    color,
    accentColor,
    backgroundColor,
    disabled,
    iconName,
    isHovered,
    isPressed,
    ...rest
  } = props;
  let iconColor;
  if (disabled) {
    iconColor = color;
  } else {
    iconColor = accentColor;
  }

  const backgroundOpacity = isPressed ? 0.3 : 1;

  return (
    <View
      style={[
        disabled && {
          opacity: 0.3,
          ...(Platform.OS === "web" && { cursor: "not-allowed" }),
        },
      ]}
    >
      <Animated.View
        style={[
          !!backgroundColor && {
            marginTop: 6,
            marginBottom: 6,
            marginLeft: 12,
            marginRight: 8,
            flexDirection: "row",
            justifyContent: "flex-end",
          },
          { opacity: backgroundOpacity },
        ]}
      >
        {"title" in props && (
          <Text
            {...rest}
            style={[
              {
                // HACK hardcoding type styles here
                fontSize: 15,
                fontFamily: "Dr-ExtraBold",
                lineHeight: 16,
                letterSpacing: 15 * 0.04,
                color: isHovered ? accentColor : color ?? defaultButtonColor,
                marginTop: 2.5,
                marginRight: 4,
              },
            ]}
            selectable={false}
            suppressHighlighting={true}
          >
            {props.title}
          </Text>
        )}
        {iconName && (
          <Icon
            name={iconName}
            position={IconPosition.Center}
            // This is a bit confusing: the button's accent color becomes the icon's tint color; the button's color becomes the icon's accent color. It's intentional, though, to produce an inversion.
            tintColor={iconColor ?? defaultButtonColor}
            accentColor={color ?? defaultButtonColor}
          />
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  soloIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
});

export default React.memo(function Button(props: ButtonProps) {
  const { onPendingInteractionStateDidChange, style } = props;
  const ref = React.useRef<View | null>(null);
  const href = "href" in props ? props.href : null;
  const onPress = "onPress" in props ? props.onPress : null;

  const isPressed = React.useRef(false);
  const isHovered = React.useRef(false);
  const lastDispatchedPendingInteractionState =
    React.useRef<ButtonPendingActivationState>(null);

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

  React.useEffect(() => {
    if (props.focusOnMount && ref.current) {
      ref.current.focus();
    }
  }, [props.focusOnMount]);

  const ButtonInteriorComponent =
    !props.size || props.size === "regular"
      ? ButtonInterior
      : SmallButtonInterior;

  // @ts-ignore
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
          ref={ref}
          accessible={true}
          accessibilityRole={href ? "link" : "button"}
          accessibilityLabel={accessibilityLabel}
          onPress={
            onPress
              ? () => {
                  isPressed.current = false;
                  dispatchPendingInteractionState();
                  onPress();
                }
              : () => {
                  Linking.openURL(href!).catch(() => {
                    Alert.alert(
                      "Couldn't open link",
                      `You may need to install an app to open this URL: ${href}`,
                    );
                  });
                }
          }
          onPressIn={() => {
            isPressed.current = true;
            dispatchPendingInteractionState();
          }}
          onPressOut={() => {
            isPressed.current = false;
            dispatchPendingInteractionState();
          }}
          // @ts-ignore react-native-web adds this prop
          delayPressOut={1} // HACK: When a press is completed, we handle onPressOut within onPress so that React batches all updates into a single re-render.
          disabled={props.disabled}
          // @ts-ignore react-native-web adds this prop.
          href={href}
          hitSlop={props.hitSlop}
          style={[isSoloIcon && styles.soloIcon, style]}
        >
          {({ pressed }) => (
            <ButtonInteriorComponent
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
