import * as Mdast from "mdast";
import * as MdastUtilFromMarkdown from "mdast-util-from-markdown";
import * as MdastUtilToMarkdown from "mdast-util-to-markdown";
import { parse } from "micromark";
import { markdownLineEnding } from "micromark-util-character";
// @ts-ignore
import { codes, constants, types } from "micromark-util-symbol";
import * as Micromark from "micromark-util-types";
import { Processor } from "unified";
import { clozeNodeType, ClozePromptNode } from "../markdown.js";

const clozeOpenToken = "clozeOpenToken";
const clozeCloseToken = "clozeCloseToken";

const clozeToken = "clozeToken";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    clozeOpenToken: typeof clozeOpenToken;
    clozeCloseToken: typeof clozeCloseToken;
    clozeToken: typeof clozeToken;
  }
}

declare module "mdast" {
  interface RootContentMap {
    clozePromptNode: ClozePromptNode;
  }
}

declare module "mdast-util-to-markdown" {
  interface ConstructNameMap {
    // Register a new construct name (value is used, key should match it).
    [clozeNodeType]: typeof clozeNodeType;
  }
}

const clozeConstruct = {
  tokenize: tokenizeOpen,
  resolveTo: resolveClozeNode,
};

const micromarkClozeExtension: Micromark.Extension = {
  text: {
    [codes.leftCurlyBrace]: clozeConstruct,
  },
};

function tokenizeOpen(
  this: Micromark.TokenizeContext,
  effects: Micromark.Effects,
  ok: Micromark.State,
  nok: Micromark.State,
) {
  return (code: Micromark.Code) => {
    effects.enter(clozeToken);
    return effects.attempt(
      { tokenize: tokenizeClozeInterior, partial: true },
      finish,
      nok,
    )(code);
  };

  // adapted from https://github.com/micromark/micromark-extension-directive/blob/main/dev/lib/factory-label.js
  function tokenizeClozeInterior(
    this: Micromark.TokenizeContext,
    effects: Micromark.Effects,
    ok: Micromark.State,
    nok: Micromark.State,
  ) {
    let previous: Micromark.Token | undefined = undefined;
    let balance = 0;

    return start;

    function start(code: Micromark.Code) {
      effects.enter(clozeOpenToken);
      effects.consume(code);
      effects.exit(clozeOpenToken);
      return afterStart;
    }

    function afterStart(code: Micromark.Code) {
      if (code === codes.rightCurlyBrace) {
        // No empty clozes.
        return nok;
      }

      return lineStart(code);
    }

    function lineStart(code: Micromark.Code) {
      if (code === codes.rightCurlyBrace && balance === 0) {
        return atClosingBrace(code);
      }
      const token = effects.enter(types.chunkText, {
        contentType: constants.contentTypeText,
        previous,
      });
      if (previous) previous.next = token;
      previous = token;
      return data(code);
    }

    function data(code: Micromark.Code) {
      if (code === codes.eof) {
        return nok(code);
      }

      if (code === codes.leftCurlyBrace) {
        balance++;
      }

      if (code === codes.rightCurlyBrace) {
        if (balance === 0) {
          effects.exit(types.chunkText);
          return atClosingBrace(code);
        } else {
          balance -= 1;
        }
      }

      if (markdownLineEnding(code)) {
        effects.consume(code);
        effects.exit(types.chunkText);
        return lineStart;
      }

      effects.consume(code);
      return code === codes.backslash ? dataEscape : data;
    }

    function dataEscape(code: Micromark.Code) {
      if (
        code === codes.leftCurlyBrace ||
        code === codes.backslash ||
        codes.rightCurlyBrace
      ) {
        effects.consume(code);
        return data;
      }

      return data(code);
    }

    function atClosingBrace(code: Micromark.Code) {
      effects.enter(clozeCloseToken);
      effects.consume(code);
      effects.exit(clozeCloseToken);
      return ok;
    }
  }

  function finish(code: Micromark.Code) {
    effects.exit(clozeToken);
    return ok(code);
  }
}

function resolveClozeNode(events: Micromark.Event[]) {
  // Remove the cloze-parsing construct from the parsers used by nested cloze tokens: we don't parse nested cloze deletions.
  for (const event of events) {
    if (event[0] === "enter" && event[1].type === types.chunkText) {
      const context = event[2];
      event[2] = {
        ...context,
        parser: parse({
          extensions: [
            {
              ...context.parser.constructs,
              text: {
                ...context.parser.constructs.text,
                [codes.leftCurlyBrace]: [
                  context.parser.constructs.text[codes.leftCurlyBrace] ?? [],
                ]
                  .flat()
                  .filter((c) => c !== clozeConstruct),
              },
            },
          ],
        }),
      };
    }
  }
  return events;
}

export default function clozePlugin(this: Processor) {
  const data = this.data();

  if (!data.toMarkdownExtensions) {
    data.toMarkdownExtensions = [];
  }
  data.toMarkdownExtensions.push({
    handlers: {
      [clozeNodeType]: clozeToMarkdown,
    },
    unsafe: [
      { character: "{", inConstruct: [clozeNodeType] },
      { character: "}", inConstruct: [clozeNodeType] },
    ],
  });

  if (!data.micromarkExtensions) {
    data.micromarkExtensions = [];
  }
  data.micromarkExtensions.push(micromarkClozeExtension);

  if (!data.fromMarkdownExtensions) {
    data.fromMarkdownExtensions = [];
  }
  data.fromMarkdownExtensions.push({
    enter: {
      [clozeToken]: enterClozeNode,
    },
    exit: {
      [clozeToken]: exitClozeNode,
    },
  });
}

function enterClozeNode(
  this: MdastUtilFromMarkdown.CompileContext,
  token: MdastUtilFromMarkdown.Token,
) {
  this.enter({ type: clozeNodeType, children: [] } as any, token);
}

function exitClozeNode(
  this: MdastUtilFromMarkdown.CompileContext,
  token: MdastUtilFromMarkdown.Token,
) {
  this.exit(token);
}

function clozeToMarkdown(
  node: ClozePromptNode,
  parent: Mdast.Parents | undefined,
  state: MdastUtilToMarkdown.State,
  info: MdastUtilToMarkdown.Info,
) {
  const tracker = state.createTracker(info);
  const exit = state.enter(clozeNodeType);
  let value = tracker.move("{");
  // @ts-ignore mdast-util-to-markdown doesn't make PhrasingParents extensible, but I promise that ClozePromptNode is one.
  value += state.containerPhrasing(node, {
    ...tracker.current(),
    before: value,
    after: "}",
  });
  value += tracker.move("}");
  exit();
  return value;
}
