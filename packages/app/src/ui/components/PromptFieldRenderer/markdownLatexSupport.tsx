import _katex from "katex";
import { use as createTexMathPlugin } from "markdown-it-texmath";
import React from "react";
import { ScrollView, StyleSheet } from "react-native";
import * as MarkdownDisplay from "react-native-markdown-display";
import * as MathJax from "react-native-mathjax-svg";
import { SvgFromXml } from "react-native-svg";
import * as colors from "../../styles/colors.js";
import { getMathLayout, getMathSVGSize } from "./mathLayout.js";

// react-native-mathjax-svg's manually-authored types omit this named export.
const texToSvg = (
  MathJax as unknown as {
    texToSvg: (tex: string, fontSize?: number, display?: boolean) => string;
  }
).texToSvg;

const mathFontScale = 0.83;

// MathJax puts glyph bounds flush against the SVG viewport. A little extra
// height keeps native SVG rendering from clipping accents and dots.
const svgVerticalPadding = 2;

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
});

export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  const plugin = createTexMathPlugin(_katex) as unknown as Parameters<
    MarkdownDisplay.MarkdownIt["use"]
  >[0];
  markdownIt.use(plugin);
}

function FittingMath(props: {
  tex: string;
  fontSize: number;
  display: boolean;
  maximumWidth?: number;
}) {
  const { tex, fontSize, display, maximumWidth } = props;
  const svg = React.useMemo(
    () =>
      // Match the package's default component, which halves its fontSize prop
      // before calling this lower-level converter.
      texToSvg(tex, fontSize / 2, display).replace(
        /currentColor/gim,
        colors.ink,
      ),
    [display, fontSize, tex],
  );
  const intrinsicSize = getMathSVGSize(svg);
  const layout = intrinsicSize
    ? getMathLayout(intrinsicSize, maximumWidth, fontSize)
    : null;

  const renderedMath = (
    <SvgFromXml
      xml={svg}
      width={layout?.contentSize.width}
      height={
        layout ? layout.contentSize.height + svgVerticalPadding : undefined
      }
      accessible
      accessibilityLabel={tex}
    />
  );

  return layout?.scrollsHorizontally ? (
    <ScrollView
      horizontal
      directionalLockEnabled
      style={[
        styles.scrollView,
        {
          width: layout.viewportSize.width,
          height: layout.viewportSize.height + svgVerticalPadding,
        },
      ]}
      showsHorizontalScrollIndicator
    >
      {renderedMath}
    </ScrollView>
  ) : (
    renderedMath
  );
}

function createMathRenderer(
  display: boolean,
  maximumWidth?: number,
): MarkdownDisplay.RenderFunction {
  return function MathRenderer(
    node,
    _children,
    _parent,
    _styles,
    inheritedStyles = {},
  ) {
    const inheritedFontSize = inheritedStyles.fontSize;
    const fontSize =
      typeof inheritedFontSize === "number"
        ? inheritedFontSize * mathFontScale
        : 14;
    return (
      <FittingMath
        key={node.key}
        tex={node.content}
        fontSize={fontSize}
        display={display}
        maximumWidth={maximumWidth}
      />
    );
  };
}

export function getLatexRenderRules(
  maximumWidth?: number,
): Pick<
  MarkdownDisplay.RenderRules,
  "math_inline" | "math_inline_double" | "math_block"
> {
  const inlineRenderer = createMathRenderer(false, maximumWidth);
  return {
    math_inline: inlineRenderer,
    math_inline_double: inlineRenderer,
    math_block: createMathRenderer(true, maximumWidth),
  };
}
