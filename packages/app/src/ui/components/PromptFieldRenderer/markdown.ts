import React from "react";
import * as MarkdownDisplay from "react-native-markdown-display";
import { clozeHighlightPlugin } from "./clozeHighlightPlugin.js";
import { addLatexSupport } from "./markdownLatexSupport.js";

export function useMarkdownItInstance(
  withLatexSupport: boolean,
): MarkdownDisplay.MarkdownIt {
  const instance = React.useRef(
    MarkdownDisplay.MarkdownIt({
      typographer: true,
    }).use(clozeHighlightPlugin),
  );

  const hasRequestedLatex = React.useRef(false);
  const [, setLatexLoaded] = React.useState(false);

  if (withLatexSupport && !hasRequestedLatex.current) {
    hasRequestedLatex.current = true;
    addLatexSupport(instance.current).then(() => setLatexLoaded(true));
  }

  return instance.current;
}
