import React from "react";
import {
  Alert,
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
import Hoverable from "./Hoverable";
import Icon from "./Icon";
import { IconName, IconPosition } from "./IconShared";
import Spacer from "./Spacer";

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
    size?: "regular" | "small" | "tiny";
    alignment?: "left" | "right";
    hitSlop?: PressableProps["hitSlop"];

    style?: StyleProp<FlexStyle>;

    onPendingInteractionStateDidChange?: (
      pendingActivationState: ButtonPendingActivationState,
    ) => void;

    numberOfLines?: number;
    ellipsizeMode?: TextProps["ellipsizeMode"];
    focusOnMount?: boolean;
  };

const defaultButtonColor = colors.ink;

const ButtonInterior = function ButtonImpl(
  props: ButtonProps & { isHovered: boolean; isPressed: boolean },
) {
  const {
    color,
    accentColor,
    backgroundColor,
    disabled,
    size = "regular",
    alignment = "left",
    iconName,
    isHovered,
    isPressed,
    ...rest
  } = props;
  const isSoloIcon = !("title" in props);
  let iconColor;
  if (disabled) {
    iconColor = color;
  } else if (isSoloIcon) {
    iconColor = color;
  } else {
    iconColor = accentColor;
  }

  let titleColor: string;
  if ((isHovered || isPressed) && !backgroundColor) {
    titleColor = accentColor ?? defaultButtonColor;
  } else {
    titleColor = color ?? defaultButtonColor;
  }

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
              { backgroundColor, opacity: isPressed || isHovered ? 1 : 0 },
            ]}
          />
          {isPressed && (
            <View
              style={[
                StyleSheet.absoluteFill,
                isSoloIcon && styles.soloIcon,
                { backgroundColor: "rgba(0, 0, 0, 0.14);" },
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
      <View
        style={[
          !isSoloIcon &&
            size === "regular" && {
              margin: layout.gridUnit * 2,
            },
          !isSoloIcon &&
            size === "small" && {
              marginTop: 12,
              marginBottom: 12,
              marginLeft: alignment === "left" && iconName ? 12 : 16,
              marginRight: alignment === "right" && iconName ? 12 : 16,
              flexDirection: alignment === "left" ? "row" : "row-reverse",
              justifyContent: "flex-start",
            },
        ]}
      >
        {iconName && (
          <Icon
            name={iconName}
            position={
              isSoloIcon || size === "small"
                ? IconPosition.Center
                : IconPosition.TopLeft
            }
            // This is a bit confusing: the button's accent color becomes the icon's tint color; the button's color becomes the icon's accent color. It's intentional, though, to produce an inversion.
            tintColor={iconColor ?? defaultButtonColor}
            accentColor={color ?? defaultButtonColor}
          />
        )}
        {size === "small" && !isSoloIcon && <Spacer units={0.5} />}
        {"title" in props && (
          <Text
            {...rest}
            style={[
              size === "regular" && type.label.layoutStyle,
              size === "small" && {
                ...type.labelSmall.layoutStyle,
                top: 0.5, // optical alignment with icon
              },
              size === "tiny" && type.labelTiny.layoutStyle,
              {
                color: titleColor,
              },
            ]}
            selectable={false}
            suppressHighlighting={true}
          >
            {props.title}
          </Text>
        )}
      </View>
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
            <ButtonInterior
              {...props}
              isHovered={isHovered && !props.disabled}
              isPressed={pressed && !props.disabled}
            />
          )}
        </Pressable>
      )}
    </Hoverable>
  );
});
