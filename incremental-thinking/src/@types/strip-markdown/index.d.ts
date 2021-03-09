declare module "strip-markdown" {
  import unified from "unified";
  import remarkStringify from "remark-stringify";
  interface StripMarkdown extends unified.Plugin<[{}?]> {
    Compiler: typeof remarkStringify.Compiler;
    (this: unified.Processor, options?: {}): void;
  }

  const stripMarkdown: StripMarkdown;
  export = stripMarkdown;
}
