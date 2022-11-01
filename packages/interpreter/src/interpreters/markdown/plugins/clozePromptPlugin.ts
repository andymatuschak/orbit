import * as Mdast from "mdast-util-from-markdown";
import { markdownLineEnding } from "micromark-util-character";
import { codes } from "micromark-util-symbol/codes.js";
import * as Micromark from "micromark-util-types";
import { Processor } from "unified";
import { processor } from "../markdown";
import { clozeNodeType, ClozePromptNode } from "../markdown";

// TODO: don't match clozes inside code and html blocks
const clozeToken = "clozePrompt";
const clozeMarkerToken = "clozePromptMarker";
const clozeChunkToken = "clozePromptChunk";

const micromarkClozeExtension: Micromark.Extension = {
  text: { [codes.leftCurlyBrace]: { tokenize } },
};

function tokenize(
  this: Micromark.TokenizeContext,
  effects: Micromark.Effects,
  ok: Micromark.State,
  nok: Micromark.State,
) {
  let balance = 1;

  return atOpeningBrace;

  function atOpeningBrace(code: Micromark.Code): Micromark.State {
    effects.enter(clozeToken);
    effects.enter(clozeMarkerToken);
    effects.consume(code);
    effects.exit(clozeMarkerToken);

    effects.enter(clozeChunkToken);
    return inside;
  }

  function inside(code: Micromark.Code): Micromark.State {
    if (code === codes.eof || markdownLineEnding(code)) {
      return nok;
    } else if (code === codes.rightCurlyBrace) {
      effects.exit(clozeChunkToken);
      return atClosingBrace(code);
    } else if (code === codes.leftCurlyBrace) {
      effects.consume(code);
      balance++;
      return inside;
    } else {
      effects.consume(code);
      return inside;
    }
  }

  function atClosingBrace(code: Micromark.Code): Micromark.State {
    balance--;
    if (balance) {
      effects.enter(clozeChunkToken);
      effects.consume(code);
      return inside;
    } else {
      effects.enter(clozeMarkerToken);
      effects.consume(code);
      effects.exit(clozeMarkerToken);
      effects.exit(clozeToken);
      return ok;
    }
  }
}

export default function clozePlugin(this: Processor) {
  const data = this.data();

  if (!data.toMarkdownExtensions) {
    data.toMarkdownExtensions = [];
  }
  (data.toMarkdownExtensions as any[]).push({
    handlers: {
      [clozeNodeType]: clozePromptCompiler,
    },
  });

  if (!data.micromarkExtensions) {
    data.micromarkExtensions = [];
  }
  (data.micromarkExtensions as any[]).push(micromarkClozeExtension);

  if (!data.fromMarkdownExtensions) {
    data.fromMarkdownExtensions = [];
  }
  (data.fromMarkdownExtensions as any[]).push({
    enter: {
      [clozeToken]: enterClozeNode,
      [clozeChunkToken]: enterClozeNodeData,
    },
    exit: {
      [clozeToken]: exitClozeNode,
      [clozeChunkToken]: exitClozeNodeData,
    },
  });
}

function enterClozeNode(this: Mdast.CompileContext, token: Mdast.Token) {
  this.enter({ type: clozeNodeType, children: [] } as any, token);
}

function exitClozeNode(this: Mdast.CompileContext, token: Mdast.Token) {
  this.exit(token);
}

function enterClozeNodeData(this: Mdast.CompileContext, token: Mdast.Token) {
  this.config.enter.data.call(this, token);
}

function exitClozeNodeData(this: Mdast.CompileContext, token: Mdast.Token) {
  this.config.exit.data.call(this, token);
}

function clozePromptCompiler(node: ClozePromptNode): string {
  const result = processor.stringify({ ...node, type: "emphasis" }) as string;
  return `{${result.slice(1, -2)}}`;
}
