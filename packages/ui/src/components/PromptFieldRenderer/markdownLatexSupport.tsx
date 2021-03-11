import { Text } from "react-native";
import * as MarkdownDisplay from "react-native-markdown-display";

export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt,
): Promise<void> {
  // TODO
}

export const renderInlineMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {},
) => {
  return node.content;
};

export const renderBlockMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {},
) => {
  return node.content;
};
