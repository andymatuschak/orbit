import MarkdownIt from "markdown-it/lib";
import Token from "markdown-it/lib/token.js";

// When a cloze is revealed, we hackily designate that to the Markdown renderer by surrounding it with sentinels. This plugin finds those sentinels and replaces them with proper tokens which will be rendered with the appropriate styling.

export const clozeStartHighlightSentinel = "zqzCLOZESTARTHIGHLIGHTzqz";
export const clozeEndHighlightSentinel = "zqzCLOZEENDHIGHLIGHTzqz";
const clozeStartRegexp = new RegExp(clozeStartHighlightSentinel);
const clozeEndRegexp = new RegExp(clozeEndHighlightSentinel);

export function clozeHighlightPlugin(md: MarkdownIt) {
  md.inline.ruler2.push("highlightCloze", (state) => {
    if (state.env.multiBlockClozeHighlightActive) {
      state.tokens.splice(
        0,
        0,
        new Token("clozeHighlight_open", "clozeHighlight", 1),
      );
    }

    function spliceTokensAtSentinel(
      sentinelRegex: RegExp,
      tokenFactory: () => Token,
    ) {
      let sentinelCount = 0;
      for (let i = 0; i < state.tokens.length; i++) {
        const token = state.tokens[i];
        if (token.type !== "text") {
          continue;
        }
        let match: RegExpExecArray | null = null;
        while ((match = sentinelRegex.exec(token.content))) {
          // Split the text token into three tokens: the text before the sentinel, the sentinel, and the text after the sentinel (which the pre-existing token will become).
          const textBeforeSentinelToken = new Token("text", "", 0);
          textBeforeSentinelToken.content = token.content.slice(0, match.index);
          const clozeHighlightToken = tokenFactory();
          state.tokens.splice(i, 0, textBeforeSentinelToken);
          state.tokens.splice(i + 1, 0, clozeHighlightToken);
          token.content = token.content.slice(match.index + match[0].length);
          i += 2;
          sentinelCount++;
        }
      }
      return sentinelCount;
    }

    const openCount = spliceTokensAtSentinel(
      clozeStartRegexp,
      () => new Token("clozeHighlight_open", "clozeHighlight", 1),
    );
    const closeCount = spliceTokensAtSentinel(
      clozeEndRegexp,
      () => new Token("clozeHighlight_close", "clozeHighlight", -1),
    );

    state.env.multiBlockClozeHighlightActive =
      openCount > closeCount ||
      (state.env.multiBlockClozeHighlightActive && openCount === closeCount);
    if (state.env.multiBlockClozeHighlightActive) {
      state.tokens.push(
        new Token("clozeHighlight_close", "clozeHighlight", -1),
      );
    }
  });
}
