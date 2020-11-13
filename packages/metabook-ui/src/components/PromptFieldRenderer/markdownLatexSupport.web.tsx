import React from "react";
import * as MarkdownItTexMath from "markdown-it-texmath";
import { StyleSheet } from "react-native";
import * as MarkdownDisplay from "react-native-markdown-display";

let _katex: typeof import("katex") | null = null;
export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt,
): Promise<void> {
  if (!_katex) {
    _katex = await import("katex");
    await import("katex/dist/katex.css");
  }
  markdownIt.use(MarkdownItTexMath.use(_katex));
}

export const renderInlineMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {},
) => {
  let output: string;
  try {
    output = _katex!.renderToString(node.content, { displayMode: false });
  } catch (error) {
    output = error;
  }
  return (
    <div
      style={{ display: "inline", fontSize: "83%" }}
      dangerouslySetInnerHTML={{
        __html: output,
      }}
    />
  );
};

export const renderBlockMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {},
) => {
  let output: string;
  try {
    output = _katex!.renderToString(node.content, { displayMode: true });
  } catch (error) {
    output = error;
  }
  return (
    <div
      style={StyleSheet.flatten(styles.math_block)}
      dangerouslySetInnerHTML={{
        __html: output,
      }}
    />
  );
};
