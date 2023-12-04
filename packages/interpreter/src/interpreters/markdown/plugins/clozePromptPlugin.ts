import * as MdastUtilFromMarkdown from "mdast-util-from-markdown";
import * as MdastUtilToMarkdown from "mdast-util-to-markdown";
import * as Mdast from "mdast";
import { resolveAll } from "micromark-util-resolve-all";
// @ts-ignore
import { codes, types } from "micromark-util-symbol";
import * as Micromark from "micromark-util-types";
import { Processor } from "unified";
import { clozeNodeType, ClozePromptNode } from "../markdown";

// TODO: don't match clozes inside html blocks
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

const micromarkClozeExtension: Micromark.Extension = {
  text: {
    [codes.leftCurlyBrace]: {
      tokenize: tokenizeOpen,
      resolveAll: resolveAllCloze,
    },
    [codes.rightCurlyBrace]: {
      tokenize: tokenizeClose,
      resolveTo: resolveToCloseCloze,
      resolveAll: resolveAllCloze,
    },
  },
};

function tokenizeOpen(
  this: Micromark.TokenizeContext,
  effects: Micromark.Effects,
  ok: Micromark.State,
) {
  return (code: Micromark.Code) => {
    effects.enter(clozeOpenToken);
    effects.consume(code);
    effects.exit(clozeOpenToken);
    return ok;
  };
}

function tokenizeClose(
  this: Micromark.TokenizeContext,
  effects: Micromark.Effects,
  ok: Micromark.State,
  nok: Micromark.State,
) {
  const self = this;
  let clozeStart: Micromark.Token | null = null;
  let index = self.events.length;
  while (index--) {
    if (
      self.events[index][1].type === clozeOpenToken &&
      !self.events[index][1]._balanced
    ) {
      clozeStart = self.events[index][1];
      break;
    }
  }

  return function (code: Micromark.Code) {
    if (!clozeStart) {
      return nok;
    }

    // We've now balanced an earlier inactivated cloze.
    if (clozeStart._inactive) {
      clozeStart._balanced = true;
      return nok(code);
    }

    effects.enter(clozeCloseToken);
    effects.consume(code);
    effects.exit(clozeCloseToken);
    return ok;
  };
}

// Find all the unmatched open and close braces and mark them as plain data, so that they'll be emitted as plaintext.
function resolveAllCloze(events: Micromark.Event[]) {
  let index = -1;

  while (++index < events.length) {
    const token = events[index][1];

    if (token.type === clozeOpenToken || token.type === clozeCloseToken) {
      token.type = types.data;
      index++;
    }
  }

  return events;
}

function resolveToCloseCloze(
  events: Micromark.Event[],
  context: Micromark.TokenizeContext,
) {
  const close = events.length - 1;
  if (events[close][1].type !== clozeCloseToken) {
    throw new Error(
      "Unexpected resolution state: last token should be cloze close token",
    );
  }
  let index = close - 1;
  let open: number | null = null;

  // Find the oldest unmatched opening cloze event.
  while (index--) {
    const token = events[index][1];
    if (open !== null) {
      if (token.type === clozeOpenToken && token._inactive) {
        // A cloze containing a cloze, which we've already inactivated.
        break;
      }
      // Mark earlier cloze openings as inactive: no clozes in clozes.
      if (events[index][0] === "enter" && token.type === clozeOpenToken) {
        token._inactive = true;
      }
    } else {
      if (
        events[index][0] === "enter" &&
        token.type === clozeOpenToken &&
        !token._balanced
      ) {
        open = index;
      }
    }
  }

  if (open === null) {
    throw new Error("No opening cloze marker found; should be unreachable");
  }

  const clozeGroup: Micromark.Token = {
    type: clozeToken,
    start: Object.assign({}, events[open][1].start),
    end: Object.assign({}, events[events.length - 1][1].end),
  };

  const clozeEvents: Micromark.Event[] = [["enter", clozeGroup, context]];

  const nullConstruct = context.parser.constructs.insideSpan.null;
  if (!nullConstruct) {
    throw new Error("insideSpan parser unexpectedly missing");
  }
  clozeEvents.push(
    ...resolveAll(nullConstruct, events.slice(open + 2, close - 1), context),
  );

  clozeEvents.push(["exit", clozeGroup, context]);

  events.splice(open, events.length, ...clozeEvents);
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
