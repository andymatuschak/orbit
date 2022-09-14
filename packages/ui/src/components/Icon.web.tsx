import React from "react";
import { StyleSheet, View } from "react-native";
import unreachableCaseError from "../util/unreachableCaseError";
import { IconName, IconPosition, IconProps, iconSize } from "./IconShared";
import TintedSVG from "./TintedSVG";

function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: false,
): string;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: true,
): string | null;
function getIconAsset(
  name: IconName,
  iconPosition: IconPosition,
  accent: boolean,
): string | null {
  switch (name) {
    case IconName.Check:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/check-TL.svg");
        case IconPosition.TopRight:
          return require("../../assets/icons/check-TR.svg");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/check-BL.svg");
        case IconPosition.BottomRight:
          return require("../../assets/icons/check-BR.svg");
        case IconPosition.Center:
          return require("../../assets/icons/check-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.Cross:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/cross-TL.svg");
        case IconPosition.TopRight:
          return require("../../assets/icons/cross-TR.svg");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/cross-BL.svg");
        case IconPosition.BottomRight:
          return require("../../assets/icons/cross-BR.svg");
        case IconPosition.Center:
          return require("../../assets/icons/cross-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.ArrowLeft:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
        case IconPosition.Center:
          // HACK
          return require("../../assets/icons/left-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.ArrowRight:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
          return require("../../assets/icons/right-TL.svg");
        case IconPosition.TopRight:
          return require("../../assets/icons/right-TR.svg");
        case IconPosition.BottomLeft:
          return require("../../assets/icons/right-BL.svg");
        case IconPosition.BottomRight:
          return require("../../assets/icons/right-BR.svg");
        case IconPosition.Center:
          return require("../../assets/icons/right-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.DoubleArrowRight:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
          // HACK
          return require("../../assets/icons/doubleRight-TL.svg");
        case IconPosition.Center:
          return require("../../assets/icons/doubleRight-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.List:
      if (accent) return null;
      switch (iconPosition) {
        case IconPosition.TopLeft:
        case IconPosition.TopRight:
        case IconPosition.BottomLeft:
        case IconPosition.BottomRight:
        case IconPosition.Center:
          // HACK
          return require("../../assets/icons/list-center.svg");
        default:
          throw unreachableCaseError(iconPosition);
      }

    case IconName.Reveal:
      if (accent) {
        switch (iconPosition) {
          case IconPosition.TopLeft:
            return require("../../assets/icons/reveal-accent-top.svg");
          case IconPosition.TopRight:
            return require("../../assets/icons/reveal-accent-top.svg");
          case IconPosition.BottomLeft:
            return require("../../assets/icons/reveal-accent-bottom.svg");
          case IconPosition.BottomRight:
            return require("../../assets/icons/reveal-accent-bottom.svg");
          case IconPosition.Center:
            return require("../../assets/icons/reveal-accent-center.svg");
        }
      } else {
        switch (iconPosition) {
          case IconPosition.TopLeft:
            return require("../../assets/icons/reveal-top.svg");
          case IconPosition.TopRight:
            return require("../../assets/icons/reveal-top.svg");
          case IconPosition.BottomLeft:
            return require("../../assets/icons/reveal-bottom.svg");
          case IconPosition.BottomRight:
            return require("../../assets/icons/reveal-bottom.svg");
          case IconPosition.Center:
            return require("../../assets/icons/reveal-center.svg");
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
      <View
        style={[
          {
            width: iconSize,
            height: iconSize,
          },
          style,
        ]}
      >
        <TintedSVG
          width={iconSize}
          height={iconSize}
          source={baseIcon}
          tintColor={tintColor}
          style={StyleSheet.absoluteFill}
        />
        <TintedSVG
          width={iconSize}
          height={iconSize}
          source={accent}
          tintColor={accentColor ?? tintColor}
          style={StyleSheet.absoluteFill}
        />
      </View>
    );
  } else {
    return (
      <TintedSVG
        width={iconSize}
        height={iconSize}
        source={baseIcon}
        tintColor={tintColor}
        style={style}
      />
    );
  }
});
