import { styles, useLayout, useTransitioningColorValue } from "./ui/index.js";
import React from "react";
import { Animated, Easing, Insets, StyleSheet, View } from "react-native";
import { LoadingScreen } from "./reviewSession/LoadingScreen.js";

export interface ReviewSessionWrapperProps {
  colorPalette: styles.colors.ColorPalette;
  children: (args: {
    containerSize: { width: number; height: number };
  }) => React.ReactNode;
  insets?: Insets;
  showLoadingOverlay?: boolean;
}

export function ReviewSessionContainer({
  colorPalette,
  children,
  insets,
  showLoadingOverlay = false,
}: ReviewSessionWrapperProps) {
  const backgroundColor = useTransitioningColorValue({
    value: colorPalette.backgroundColor,
    timing: {
      type: "timing",
      useNativeDriver: false,
      duration: 150,
      easing: Easing.linear,
    },
  });

  const {
    width: containerWidth,
    height: containerHeight,
    onLayout,
  } = useLayout();

  return (
    <Animated.View
      style={{
        flex: 1,
        backgroundColor,
        paddingTop: insets?.top ?? 0,
        paddingLeft: insets?.left ?? 0,
        paddingRight: insets?.right ?? 0,
        paddingBottom: insets?.bottom ?? 0,
      }}
    >
      <View
        pointerEvents={showLoadingOverlay ? "none" : "auto"}
        accessibilityElementsHidden={showLoadingOverlay}
        style={{
          flex: 1,
          width: "100%",
          maxWidth: styles.layout.maximumContentWidth,
          maxHeight: styles.layout.maximumContentHeight,
          margin: "auto",
        }}
        onLayout={onLayout}
      >
        {containerWidth > 0
          ? children({
              containerSize: { width: containerWidth, height: containerHeight },
            })
          : null}
      </View>
      {showLoadingOverlay && (
        <View style={StyleSheet.absoluteFill}>
          <LoadingScreen />
        </View>
      )}
    </Animated.View>
  );
}
