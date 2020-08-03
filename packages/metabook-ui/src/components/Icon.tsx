import React from "react";
import {
  ColorValue,
  FlexStyle,
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
} from "react-native";
import unreachableCaseError from "../util/unreachableCaseError";

export enum IconName {
  Check = "check",
  Cross = "cross",
  Reveal = "reveal",
}

export enum IconPosition {
  TopLeft = "TL",
  TopRight = "TR",
  BottomLeft = "BL",
  BottomRight = "BR",
}

export interface IconProps {
  name: IconName;
  position: IconPosition;
  style?: StyleProp<FlexStyle>;
  tintColor?: ColorValue;
  accentColor?: ColorValue;
}

function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: false,
): number;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: true,
): number | null;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: boolean,
): number | null {
  switch (name) {
    case IconName.Check:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/check-TL.png");
        case IconPosition.TopRight:
          return require("../../assets/icons/check-TR.png");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/check-BL.png");
        case IconPosition.BottomRight:
          return require("../../assets/icons/check-BR.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.Cross:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/cross-TL.png");
        case IconPosition.TopRight:
          return require("../../assets/icons/cross-TR.png");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/cross-BL.png");
        case IconPosition.BottomRight:
          return require("../../assets/icons/cross-BR.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.Reveal:
      if (accent) {
        switch (iconPosition) {
          case IconPosition.TopLeft:
            return require("../../assets/icons/reveal-accent-top.png");
          case IconPosition.TopRight:
            return require("../../assets/icons/reveal-accent-top.png");
          case IconPosition.BottomLeft:
            return require("../../assets/icons/reveal-accent-bottom.png");
          case IconPosition.BottomRight:
            return require("../../assets/icons/reveal-accent-bottom.png");
        }
      } else {
        switch (iconPosition) {
          case IconPosition.TopLeft:
            return require("../../assets/icons/reveal-top.png");
          case IconPosition.TopRight:
            return require("../../assets/icons/reveal-top.png");
          case IconPosition.BottomLeft:
            return require("../../assets/icons/reveal-bottom.png");
          case IconPosition.BottomRight:
            return require("../../assets/icons/reveal-bottom.png");
        }
      }
      throw unreachableCaseError(iconPosition);
  }
}

export default React.memo(function Icon(props: IconProps) {
  const { tintColor, accentColor, style, position, name } = props;

  const baseIcon = getIconAsset(name, position, false);
  const accent = getIconAsset(name, position, true);

  if (accent !== null) {
    return (
      <View style={[styles.imageMetrics, style]}>
        <Image
          source={getIconAsset(name, position, false)}
          style={[
            StyleSheet.absoluteFill,
            !!tintColor && { tintColor: tintColor },
          ]}
        />
        <Image
          source={accent}
          style={[
            StyleSheet.absoluteFill,
            { tintColor: accentColor ?? tintColor },
          ]}
        />
      </View>
    );
  } else {
    return (
      <Image
        source={baseIcon}
        style={[
          { width: 24, height: 24 },
          !!tintColor && { tintColor: tintColor },
          style as StyleProp<ImageStyle>,
        ]}
      />
    );
  }
});

const styles = StyleSheet.create({
  imageMetrics: {
    width: 24,
    height: 24,
  },
});
