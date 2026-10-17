import type { Parent, Parents, PhrasingContent } from "mdast";
import type { CompileContext, Token } from "mdast-util-from-markdown";
import type { Info, State } from "mdast-util-to-markdown";
import { parse } from "micromark";
import { markdownLineEnding } from "micromark-util-character";
import { codes, constants, types } from "micromark-util-symbol";
import type {
  Code,
  Construct,
  Event,
  State as TokenizerState,
  Token as MicromarkToken,
  Tokenizer,
} from "micromark-util-types";
import type {} from "remark-parse";
import type {} from "remark-stringify";
import type { Processor } from "unified";

export const CLOZE_NODE_TYPE = "cloze";

/** A single cloze span. Its interior is ordinary Markdown, not nested clozes. */
export interface ClozeNode extends Parent {
  type: typeof CLOZE_NODE_TYPE;
  children: PhrasingContent[];
  componentID?: string;
}

declare module "mdast" {
  interface PhrasingContentMap {
    cloze: ClozeNode;
  }

  interface RootContentMap {
    cloze: ClozeNode;
  }
}

declare module "micromark-util-types" {
  interface TokenTypeMap {
    cloze: "cloze";
    clozeOpen: "clozeOpen";
    clozeClose: "clozeClose";
    clozeIdentifier: "clozeIdentifier";
  }
}

declare module "mdast-util-to-markdown" {
  interface ConstructNameMap {
    cloze: typeof CLOZE_NODE_TYPE;
  }
}

/** Add cloze parsing and serialization to a remark processor. */
export function clozeSyntax(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push({
    text: { [codes.leftCurlyBrace]: clozeConstruct },
  });
  (data.fromMarkdownExtensions ??= []).push({
    enter: { cloze: enterCloze },
    exit: { cloze: exitCloze, clozeIdentifier: exitClozeIdentifier },
  });
  (data.toMarkdownExtensions ??= []).push({
    handlers: { cloze: clozeToMarkdown },
    unsafe: [
      { character: "{", inConstruct: [CLOZE_NODE_TYPE] },
      { character: "}", inConstruct: [CLOZE_NODE_TYPE] },
    ],
  });
}

const tokenizeCloze: Tokenizer = function (effects, ok, nok) {
  return start;

  function start(code: Code) {
    effects.enter("cloze");
    return effects.attempt(
      { tokenize: tokenizeInterior, partial: true },
      finish,
      nok,
    )(code);
  }

  function finish(code: Code) {
    effects.exit("cloze");
    return ok(code);
  }
};

// Adapted from micromark-extension-directive's factory-label. The interior is
// emitted as linked chunkText tokens so micromark can parse emphasis, math,
// links, and other phrasing syntax without allowing it to cross cloze borders.
const tokenizeInterior: Tokenizer = function (effects, ok, nok) {
  let previous: MicromarkToken | undefined;
  let balance = 0;
  return start;

  function start(code: Code) {
    effects.enter("clozeOpen");
    effects.consume(code);
    effects.exit("clozeOpen");
    return afterStart;
  }

  function afterStart(code: Code) {
    // Empty braces are ordinary text, not clozes.
    if (code === codes.rightCurlyBrace) return nok(code);
    return effects.attempt(
      { tokenize: tokenizeIdentifier, partial: true },
      afterIdentifier,
      lineStart,
    )(code);
  }

  function afterIdentifier(code: Code) {
    // An identifier does not turn an empty blank into learning content.
    return code === codes.rightCurlyBrace ? nok(code) : lineStart(code);
  }

  function lineStart(code: Code) {
    if (code === codes.rightCurlyBrace && balance === 0) {
      return close(code);
    }
    const token = effects.enter(types.chunkText, {
      contentType: constants.contentTypeText,
      previous,
    });
    if (previous) previous.next = token;
    previous = token;
    return data(code);
  }

  function data(code: Code) {
    if (code === codes.eof) return nok(code);

    if (code === codes.leftCurlyBrace) balance++;
    if (code === codes.rightCurlyBrace) {
      if (balance === 0) {
        effects.exit(types.chunkText);
        return close(code);
      }
      balance--;
    }

    if (markdownLineEnding(code)) {
      effects.consume(code);
      effects.exit(types.chunkText);
      return lineStart;
    }

    effects.consume(code);
    return code === codes.backslash ? escape : data;
  }

  function escape(code: Code) {
    if (
      code === codes.leftCurlyBrace ||
      code === codes.rightCurlyBrace ||
      code === codes.backslash
    ) {
      effects.consume(code);
      return data;
    }
    return data(code);
  }

  function close(code: Code) {
    effects.enter("clozeClose");
    effects.consume(code);
    effects.exit("clozeClose");
    return ok;
  }
};

const tokenizeIdentifier: Tokenizer = function (effects, ok, nok) {
  return start;

  function start(code: Code) {
    if (!isIdentifierCharacter(code)) return nok(code);
    effects.enter("clozeIdentifier");
    return identifier(code);
  }

  function identifier(code: Code): TokenizerState | undefined {
    if (isIdentifierCharacter(code)) {
      effects.consume(code);
      return identifier;
    }
    if (code !== codes.colon) return nok(code);
    effects.consume(code);
    return secondColon;
  }

  function secondColon(code: Code) {
    if (code !== codes.colon) return nok(code);
    effects.consume(code);
    effects.exit("clozeIdentifier");
    return ok;
  }
};

function isIdentifierCharacter(code: Code): boolean {
  return (
    code !== null &&
    ((code >= codes.digit0 && code <= codes.digit9) ||
      (code >= codes.uppercaseA && code <= codes.uppercaseZ) ||
      (code >= codes.lowercaseA && code <= codes.lowercaseZ) ||
      code === codes.dash ||
      code === codes.underscore)
  );
}

const clozeConstruct: Construct = {
  tokenize: tokenizeCloze,
  resolveTo: resolveCloze,
};

function resolveCloze(events: Event[]): Event[] {
  // Parse the interior with all existing extensions except this construct:
  // nested braces are balanced literal text, not independently reviewed blanks.
  for (const event of events) {
    if (event[0] !== "enter" || event[1].type !== types.chunkText) continue;
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
                .filter((construct) => construct !== clozeConstruct),
            },
          },
        ],
      }),
    };
  }
  return events;
}

function enterCloze(this: CompileContext, token: Token): void {
  this.enter({ type: CLOZE_NODE_TYPE, children: [] }, token);
}

function exitCloze(this: CompileContext, token: Token): void {
  this.exit(token);
}

function exitClozeIdentifier(this: CompileContext, token: Token): void {
  const node = this.stack[this.stack.length - 1] as ClozeNode;
  node.componentID = this.sliceSerialize(token).slice(0, -2);
}

function clozeToMarkdown(
  node: ClozeNode,
  _parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const tracker = state.createTracker(info);
  const exit = state.enter(CLOZE_NODE_TYPE);
  let value = tracker.move(
    node.componentID === undefined ? "{" : `{${node.componentID}::`,
  );
  let content = state.containerPhrasing(node, {
    ...tracker.current(),
    before: value,
    after: "}",
  });
  // An escaped literal prefix must not become an ID when canonical Markdown
  // is reparsed to calculate ranges. Leave unrelated colons unchanged.
  if (node.componentID === undefined)
    content = content.replace(/^([A-Za-z0-9_-]+)::/, "$1\\::");
  value += content;
  value += tracker.move("}");
  exit();
  return value;
}
