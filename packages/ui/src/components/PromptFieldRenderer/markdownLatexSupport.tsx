import * as MarkdownDisplay from "react-native-markdown-display";

export async function addLatexSupport(
  markdownIt: MarkdownDisplay.MarkdownIt, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<void> {
  // TODO
}

export const renderInlineMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  return node.content;
};

export const renderBlockMath: MarkdownDisplay.RenderFunction = (
  node,
  children,
  parent,
  styles,
  inheritedStyles = {}, // eslint-disable-line @typescript-eslint/no-unused-vars
) => {
  return node.content;
};
