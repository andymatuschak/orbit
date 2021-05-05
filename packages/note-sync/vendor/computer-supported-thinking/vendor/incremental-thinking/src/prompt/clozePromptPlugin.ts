import mdast from "mdast";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import unified from "unified";
import unist from "unist";
import { clozeNodeType, ClozePromptNode } from "./index";

// TODO: don't match clozes inside code and html blocks
const clozeRegexp = /^{(.+?)}/;
export default function clozePlugin(this: unified.Processor) {
  function clozeTokenizer(
    this: remarkParse.Parser & {
      tokenizeInline: (
        content: string,
        now: {
          line: number;
          column: number;
          offset: number;
        },
      ) => mdast.PhrasingContent[];
    },
    eat: remarkParse.Eat & {
      now: () => {
        line: number;
        column: number;
        offset: number;
      };
    },
    value: string,
  ) {
    const match = clozeRegexp.exec(value);
    if (match) {
      const now = eat.now();
      now.column += 1;
      now.offset += 1;
      const children = this.tokenizeInline(match[1], now);
      const output: ClozePromptNode = {
        type: clozeNodeType,
        children,
      };
      return eat(match[0])(output);
    }
  }
  clozeTokenizer.locator = (value: string, fromIndex: number) => {
    return value.indexOf("{", fromIndex);
  };
  const parserPrototype = this.Parser.prototype as remarkParse.Parser;
  parserPrototype.inlineTokenizers.clozePrompt = clozeTokenizer as remarkParse.Tokenizer;
  parserPrototype.inlineMethods.splice(
    parserPrototype.inlineMethods.indexOf("text"),
    0,
    "clozePrompt",
  );
  const compilerPrototype = this.Compiler.prototype as remarkStringify.Compiler;
  compilerPrototype.visitors[clozeNodeType] = clozePromptCompiler as (
    node: unist.Node,
  ) => string;
}

function clozePromptCompiler(
  this: remarkStringify.Compiler & {
    all: (node: unist.Node) => string[];
  },
  node: ClozePromptNode,
): string {
  const content = this.all(node).join("");
  return `{${content}}`;
}
