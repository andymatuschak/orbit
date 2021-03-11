import React from "react";
import * as MarkdownDisplay from "react-native-markdown-display";
import { clozeParsePlugin } from "./clozeParsePlugin";
import { addLatexSupport } from "./markdownLatexSupport";

export function useMarkdownItInstance(
  withLatexSupport: boolean,
): MarkdownDisplay.MarkdownIt {
  const instance = React.useRef(
    MarkdownDisplay.MarkdownIt({
      typographer: true,
    }).use(clozeParsePlugin),
  );

  const hasRequestedLatex = React.useRef(false);
  const [, setLatexLoaded] = React.useState(false);

  if (withLatexSupport && !hasRequestedLatex.current) {
    hasRequestedLatex.current = true;
    addLatexSupport(instance.current).then(() => setLatexLoaded(true));
  }

  return instance.current;
}
