import React from "react";
import * as MarkdownItTexMath from "markdown-it-texmath";
import { StyleSheet } from "react-native";
import * as MarkdownDisplay from "react-native-markdown-display";

// TODO: Make Katex async again once expo/webpack-config supports webpack@5
import _katex from "katex";
// @ts-ignore
import "katex/dist/katex.css";
// let _katex: typeof import("katex") | null = null;
export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt,
): Promise<void> {
  if (!_katex) {
    // _katex = await import("katex");
    // @ts-ignore
    // await import("katex/dist/katex.css");
  }
  markdownIt.use(MarkdownItTexMath.use(_katex));
}

export const renderInlineMath: MarkdownDisplay.RenderFunction = (
  node,
  // children,
  // parent,
  // styles,
  // inheritedStyles = {},
) => {
  let output: string;
  try {
    output = _katex!.renderToString(node.content, { displayMode: false });
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
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
  _children,
  _parent,
  styles,
  inheritedStyles = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  let output: string;
  try {
    output = _katex!.renderToString(node.content, { displayMode: true });
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
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
