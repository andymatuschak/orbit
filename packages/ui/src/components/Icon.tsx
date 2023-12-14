import React from "react";
import {
  Image,
  ImageRequireSource,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
} from "react-native";
import unreachableCaseError from "../util/unreachableCaseError.js";
import { IconName, IconPosition, IconProps, iconSize } from "./IconShared.js";

function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: false,
): ImageRequireSource;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: true,
): ImageRequireSource | null;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: boolean,
): ImageRequireSource | null {
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
        case IconPosition.Center:
          return require("../../assets/icons/check-center.png");
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
        case IconPosition.Center:
          return require("../../assets/icons/cross-center.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.ArrowRight:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/right-TL.png");
        case IconPosition.TopRight:
          return require("../../assets/icons/right-TR.png");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/right-BL.png");
        case IconPosition.BottomRight:
          return require("../../assets/icons/right-BR.png");
        case IconPosition.Center:
          return require("../../assets/icons/right-center.png");
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
          case IconPosition.Center:
            return require("../../assets/icons/reveal-accent-center.png");
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
          case IconPosition.Center:
            return require("../../assets/icons/reveal-center.png");
        }
      }
      throw unreachableCaseError(iconPosition);

    case IconName.ArrowLeft:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
          throw new Error("Left arrow icon doesn't support this position");
        case IconPosition.Center:
          return require("../../assets/icons/left-center.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.DoubleArrowRight:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
          throw new Error("Double right icon doesn't support this position");
        case IconPosition.TopLeft:
          return require("../../assets/icons/doubleRight-TL.png");
        case IconPosition.Center:
          return require("../../assets/icons/doubleRight-center.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.List:
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
          throw new Error("List icon doesn't support this position");
        case IconPosition.Center:
          return require("../../assets/icons/list-center.png");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.Menu:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
          throw new Error("Menu icon doesn't support this position");
        case IconPosition.Center:
          return require("../../assets/icons/dots-center.png");
        default:
          throw unreachableCaseError(iconPosition);
      }
  }
}

export const styles = StyleSheet.create({
  imageMetrics: {
    width: iconSize,
    height: iconSize,
  },
});
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
          styles.imageMetrics,
          !!tintColor && { tintColor: tintColor },
          style as StyleProp<ImageStyle>,
        ]}
      />
    );
  }
});
