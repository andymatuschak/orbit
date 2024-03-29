import _katex from "katex";
import * as MarkdownItTexMath from "markdown-it-texmath";
import React from "react";
import * as MarkdownDisplay from "react-native-markdown-display";
import MathJax from "react-native-mathjax-svg";
import * as colors from "../../styles/colors";

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
    <MathJax
      fontSize={inheritedStyles.fontSize * 0.83}
      color={colors.ink}
      display={false}
    >
      {node.content}
    </MathJax>
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
    <MathJax
      fontSize={inheritedStyles.fontSize * 0.83}
      color={colors.ink}
      display={true}
    >
      {node.content}
    </MathJax>
  );
};
