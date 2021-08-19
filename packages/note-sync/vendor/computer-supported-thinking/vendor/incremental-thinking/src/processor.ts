import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import backlinksPlugin from "./backlinksPlugin";
import bearIDPlugin from "./bearIDPlugin";
import noteLinkProcessorPlugin from "./noteLinkProcessorPlugin";
import clozePromptPlugin from "./prompt/clozePromptPlugin";
import qaPromptPlugin from "./prompt/qaPromptPlugin";

export const markdownProcessor = unified()
  .use(remarkParse as any)
  .use(remarkStringify, {
    bullet: "*",
    emphasis: "*",
    listItemIndent: "one",
    rule: "-",
    ruleSpaces: false,
  });

const processor = markdownProcessor()
  .use(noteLinkProcessorPlugin)
  .use(backlinksPlugin)
  .use(bearIDPlugin)
  .use(clozePromptPlugin)
  .use(qaPromptPlugin);

export default processor;
