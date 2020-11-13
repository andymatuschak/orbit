import MarkdownIt, { Delimiter } from "markdown-it/lib";
import Token from "markdown-it/lib/token";

export function clozeParsePlugin(md: MarkdownIt) {
  const startDelimiterCode = "{".charCodeAt(0);
  const endDelimiterCode = "}".charCodeAt(0);
  md.inline.ruler.before("emphasis", "clozeHighlight", (state, silent) => {
    if (silent) {
      return false;
    }

    const marker = state.src.charCodeAt(state.pos);
    if (!(marker === startDelimiterCode || marker === endDelimiterCode)) {
      return false;
    }

    const scanned = state.scanDelims(state.pos, true);
    if (scanned.length !== 1) {
      return false;
    }

    const token = state.push("text", "", 0);
    token.content = String.fromCharCode(marker);

    state.delimiters.push({
      marker: marker,
      length: scanned.length,
      jump: 0,
      token: state.tokens.length - 1,
      end: -1,
      open: scanned.can_open,
      close: scanned.can_close,
      level: 0,
    });

    state.pos += scanned.length;
    return true;
  });

  md.inline.ruler2.after("emphasis", "clozeHighlight", (state) => {
    const clozeHighlightWasActive = state.env.clozeHighlightActive;
    const allDelimiters = [
      state.delimiters,
      ...state.tokens_meta.map(
        (m: { delimiters: Delimiter[] }) => m?.delimiters ?? [],
      ),
    ].reduce<Delimiter[]>((all, current) => all.concat(current), []);

    const startDelimiter = allDelimiters.find(
      (delimiter) => delimiter.marker === startDelimiterCode,
    );
    if (startDelimiter) {
      state.tokens.splice(
        startDelimiter.token,
        1,
        new Token("clozeHighlight_open", "clozeHighlight", 1),
      );
      state.env.clozeHighlightActive = true;
    }

    const endDelimiter = allDelimiters.find(
      (delimiter) => delimiter.marker === endDelimiterCode,
    );
    if (endDelimiter) {
      state.tokens.splice(
        endDelimiter.token,
        1,
        new Token("clozeHighlight_close", "clozeHighlight", -1),
      );
      state.env.clozeHighlightActive = false;
    } else if (state.env.clozeHighlightActive) {
      state.tokens.splice(
        state.tokens.length,
        0,
        new Token("clozeHighlight_close", "clozeHighlight", -1),
      );
    }

    if (clozeHighlightWasActive) {
      state.tokens.splice(
        0,
        0,
        new Token("clozeHighlight_open", "clozeHighlight", 1),
      );
    }
  });
}
