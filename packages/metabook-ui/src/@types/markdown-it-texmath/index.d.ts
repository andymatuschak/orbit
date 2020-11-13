declare module "markdown-it-texmath" {
  import MarkdownIt from "markdown-it";
  import katex from "katex";
  export function use(
    katexInstance: typeof katex,
  ): (md: MarkdownIt, ...params: unknown[]) => void;
}
