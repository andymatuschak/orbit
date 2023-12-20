import { ClozeTaskContent } from "@withorbit/core";
import { CryptoBase64Hasher } from "../../hasher/CryptoBase64Hasher.js";
import { InterpretableFile } from "../../interpreter.js";
import { MarkdownInterpreter } from "./MarkdownInterpreter.js";

async function ingestFromString(content: string) {
  const file: InterpretableFile = {
    name: "Hello World.md",
    path: "/some/file/path/Hello World.md",
    content,
  };
  const interpreter = new MarkdownInterpreter(CryptoBase64Hasher);
  return await interpreter.interpret([file]);
}

it("interprets bear export file with mixed content", async () => {
  const ingestible = await ingestFromString(`# Hello World

This is an example document which will contain both normal prompts and cloze prompts.
    
Q. What is the influence of A on B?
A. It makes B harder to read w.r.t A
    
This is another paragraph.
    
Q. This is another prompt.
A. Which contains a completely valid answer.
    
This is a {test} cloze prompt
    
<!-- {BearID:0DE4CB36-2EFC-4207-9074-667CBAE25ABB-12048-0000D97D373A46D2} -->`);
  expect(ingestible.sources).toHaveLength(1);
  expect(ingestible.sources[0]).toMatchSnapshot();
});

it("interprets raw markdown file with mixed content", async () => {
  const ingestible = await ingestFromString(`# Hello World

This is an example document which will contain both normal prompts and cloze prompts.
    
Q. What is the influence of A on B?
A. It makes B harder to read w.r.t A
    
This is another paragraph.
    
Q. This is another prompt.
A. Which contains a completely valid answer.
    
This is a {test} cloze {prompt}`);
  expect(ingestible.sources).toHaveLength(1);
  expect(ingestible.sources[0]).toMatchSnapshot();
});

it("interprets markdown with multiple dollar signs", async () => {
  const ingestible = await ingestFromString(`Five {$2} apples costs {$10}.`);
  expect(ingestible.sources[0].items).toHaveLength(1);
  const clozeContent = ingestible.sources[0].items[0].spec
    .content as ClozeTaskContent;
  expect(Object.keys(clozeContent.components)).toHaveLength(2);
  const component1 = clozeContent.components["0"];
  expect(
    clozeContent.body.text.slice(
      component1.ranges[0].startIndex,
      component1.ranges[0].startIndex + component1.ranges[0].length,
    ),
  ).toEqual("\\$2"); // note that the output will have delimiters escaped for safety
  const component2 = clozeContent.components["1"];
  expect(
    clozeContent.body.text.slice(
      component2.ranges[0].startIndex,
      component2.ranges[0].startIndex + component2.ranges[0].length,
    ),
  ).toEqual("\\$10");
});

it("interprets markdown with escaped and nested braces", async () => {
  const ingestible = await ingestFromString(`a {x\\}y} {z{1}w}`);
  expect(ingestible.sources[0].items).toHaveLength(1);
  const clozeContent = ingestible.sources[0].items[0].spec
    .content as ClozeTaskContent;
  expect(Object.keys(clozeContent.components)).toHaveLength(2);
  const component1 = clozeContent.components["0"];
  expect(
    clozeContent.body.text.slice(
      component1.ranges[0].startIndex,
      component1.ranges[0].startIndex + component1.ranges[0].length,
    ),
  ).toEqual("x\\}y"); // note that the output will have delimiters escaped for safety
  const component2 = clozeContent.components["1"];
  expect(
    clozeContent.body.text.slice(
      component2.ranges[0].startIndex,
      component2.ranges[0].startIndex + component2.ranges[0].length,
    ),
  ).toEqual("z\\{1\\}w");
});
