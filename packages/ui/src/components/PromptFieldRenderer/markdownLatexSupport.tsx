import _katex from "katex";
import * as MarkdownItTexMath from "markdown-it-texmath";
import React from "react";
import * as MarkdownDisplay from "react-native-markdown-display";
import * as MathJax from "react-native-mathjax-svg";
import * as colors from "../../styles/colors.js";

// @ts-ignore react-native-mathjax-svg is a CJS-type module, but its manually-authored .d.ts is written as if it's an ESM module. This requires some manual coercion when moduleResultion is "nodenext"
const MathjaxComponent: JSX.ElementType = MathJax.default;

export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  markdownIt.use(MarkdownItTexMath.use(_katex));
}

export const renderInlineMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  return (
    <MathjaxComponent
      fontSize={inheritedStyles.fontSize * 0.83}
      color={colors.ink}
      display={false}
    >
      {node.content}
    </MathjaxComponent>
  );
};

export const renderBlockMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  return (
    <MathjaxComponent
      fontSize={inheritedStyles.fontSize * 0.83}
      color={colors.ink}
      display={true}
    >
      {node.content}
    </MathjaxComponent>
  );
};
