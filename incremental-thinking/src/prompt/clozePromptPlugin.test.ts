import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import unified from "unified";
import { clozeNodeType } from "./index";
import promptProcessorPlugin from "./clozePromptPlugin";

export const processor = unified()
  .use(remarkParse, { commonmark: true, pedantic: true })
  .use(remarkStringify)
  .use(promptProcessorPlugin);

test("parses cloze", () => {
  const markdown = "This is {a test}";
  const ast = processor.parse(markdown);
  expect(ast).toMatchObject({
    children: [{
      type: "paragraph",
      children: [
        { type: "text", value: "This is " },
        { type: clozeNodeType, children: [{ type: "text", value: "a test" }] }
      ]
    }]
  });

  expect(processor.stringify(ast).trimRight()).toEqual(markdown);
});
