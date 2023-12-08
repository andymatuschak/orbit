import { ClozeTaskContentComponent } from "../task.js";

/**
 * Parses a string indicating cloze prompts using a simple single-curly brace syntax.
 *
 * Example: "Foo {bar baz} bat {quux}" indicates two cloze ranges.
 *
 * This syntax is limited and will likely need to change long-term: too many collisions with natural text, and particularly with math.
 */
export function parseSingleCurlyBraceClozePromptMarkup(markup: string): {
  markupWithoutBraces: string;
  clozeComponents: { [key: string]: ClozeTaskContentComponent };
} {
  let matchIndex = 0;
  let match: RegExpExecArray | null;

  let markupWithoutBraces = "";
  let previousMatchStartIndex = 0;
  const clozeRegexp = new RegExp(/{([^{}]+?)}/g);
  const clozeComponents: { [key: string]: ClozeTaskContentComponent } = {};
  for (; (match = clozeRegexp.exec(markup)); matchIndex++) {
    markupWithoutBraces += markup.slice(previousMatchStartIndex, match.index);
    markupWithoutBraces += match[1]; // append only the region inside the braces to the output string
    previousMatchStartIndex = clozeRegexp.lastIndex;

    clozeComponents[matchIndex.toString()] = {
      order: matchIndex,
      ranges: [
        {
          startIndex: match.index - matchIndex * 2,
          length: match[1].length,
          hint: null,
        },
      ],
    };
  }
  markupWithoutBraces += markup.slice(previousMatchStartIndex);
  return { markupWithoutBraces, clozeComponents };
}
