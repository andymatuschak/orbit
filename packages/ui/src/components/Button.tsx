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

const ButtonInterior = function ButtonImpl(
  props: ButtonProps & { isHovered: boolean },
) {
  const {
    color = colors.ink,
    accentColor = colors.ink,
    backgroundColor,
    disabled,
    size = "regular",
    alignment = "left",
    iconName,
    isHovered,
    numberOfLines,
    ellipsizeMode,
  } = props;
  const isSoloIcon = !("title" in props);

  const iconColor = disabled ? color : isSoloIcon ? color : accentColor;

  return (
    <View
      style={[
        !isSoloIcon &&
          !!backgroundColor &&
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
          tintColor={iconColor}
          accentColor={
            // HACK
            color === iconColor ? colors.ink : color
          }
        />
      )}
      {size === "small" && !isSoloIcon && <Spacer units={0.5} />}
      {"title" in props && (
        <Text
          numberOfLines={numberOfLines}
          ellipsizeMode={ellipsizeMode}
          style={[
            size === "regular" && type.label.layoutStyle,
            size === "small" && {
              ...type.labelSmall.layoutStyle,
              top: 0.5, // optical alignment with icon
            },
            size === "tiny" && type.labelTiny.layoutStyle,
            {
              color: isHovered && !backgroundColor ? accentColor : color,
            },
          ]}
          selectable={false}
          suppressHighlighting={true}
        >
          {props.title}
        </Text>
      )}
    </View>
  );
};

function openURL(href: string | null) {
  Linking.openURL(href!).catch(() => {
    Alert.alert(
      "Couldn't open link",
      `You may need to install an app to open this URL: ${href}`,
    );
  });
}

export default React.memo(function Button(props: ButtonProps) {
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
      props.onPendingInteractionStateDidChange?.(activationState);
    }
  }

  React.useEffect(() => {
    if (props.focusOnMount && ref.current) {
      ref.current.focus();
    }
  }, [props.focusOnMount]);

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
          accessibilityLabel={
            "title" in props ? props.title : props.accessibilityLabel
          }
          onPress={
            onPress
              ? () => {
                  isPressed.current = false;
                  dispatchPendingInteractionState();
                  onPress();
                }
              : () => openURL(href)
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
          style={[
            props.disabled && {
              opacity: 0.3,
              ...(Platform.OS === "web" && { cursor: "not-allowed" }),
            },
            props.iconName &&
              !("title" in props) && {
                width: 32,
                height: 32,
                borderRadius: 16,
                overflow: "hidden",
                alignItems: "center",
                justifyContent: "center",
              },
            !!props.backgroundColor &&
              isHovered && { backgroundColor: props.backgroundColor },
            props.style,
          ]}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor: "rgba(0, 0, 0, 0.14);",
                    opacity: pressed ? 1 : 0,
                  },
                ]}
              />
              <ButtonInterior
                {...props}
                isHovered={isHovered && !props.disabled}
              />
            </>
          )}
        </Pressable>
      )}
    </Hoverable>
  );
});
