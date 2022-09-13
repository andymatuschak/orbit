import { CryptoBase64Hasher } from "../../hasher/CryptoBase64Hasher";
import { InterpretableFile } from "../../interpreter";
import { MarkdownInterpreter } from "./MarkdownInterpreter";

it("interprets bear export file with mixed content", async () => {
  const file: InterpretableFile = {
    name: "Hello World.md",
    path: "/some/file/path/Hello World.md",
    content: `# Hello World

This is an example document which will contain both normal prompts and cloze prompts.
    
Q. What is the influence of A on B?
A. It makes B harder to read w.r.t A
    
This is another paragraph.
    
Q. This is another prompt.
A. Which contains a completely valid answer.
    
This is a {test} cloze prompt
    
<!-- {BearID:0DE4CB36-2EFC-4207-9074-667CBAE25ABB-12048-0000D97D373A46D2} -->`,
  };
  const interpreter = new MarkdownInterpreter(CryptoBase64Hasher);
  const ingestible = await interpreter.interpret([file]);
  expect(ingestible.sources).toHaveLength(1);
  expect(ingestible.sources[0]).toMatchSnapshot();
});

it("interprets raw markdown file with mixed content", async () => {
  const file: InterpretableFile = {
    name: "Hello World.md",
    path: "/some/file/path/Hello World.md",
    content: `# Hello World

This is an example document which will contain both normal prompts and cloze prompts.
    
Q. What is the influence of A on B?
A. It makes B harder to read w.r.t A
    
This is another paragraph.
    
Q. This is another prompt.
A. Which contains a completely valid answer.
    
This is a {test} cloze prompt`,
  };
  const interpreter = new MarkdownInterpreter(CryptoBase64Hasher);
  const ingestible = await interpreter.interpret([file]);
  expect(ingestible.sources).toHaveLength(1);
  expect(ingestible.sources[0]).toMatchSnapshot();
});
