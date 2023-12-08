import mdast from "mdast";
import { selectAll } from "unist-util-select";
import {
  clozeNodeType,
  ClozePrompt,
  ClozePromptNode,
  clozePromptType,
  findAllPrompts,
  processor,
  qaPromptType,
} from "./markdown.js";

function getPrompts(input: string) {
  return findAllPrompts(
    processor.runSync(processor.parse(input)) as mdast.Root,
  );
}

test("double cloze", () => {
  const prompts = getPrompts(`# Heading
  
  This paragraph {has two} cloze {prompts}.
  
  This one has none.`);

  expect(prompts).toHaveLength(1);
  const prompt = prompts[0] as ClozePrompt;
  expect(prompt.type).toEqual(clozePromptType);
  expect(prompt.block.type).toBe("paragraph");
  const clozeNodes = selectAll(clozeNodeType, prompt.block);
  expect(clozeNodes).toHaveLength(2);
  expect((clozeNodes[1] as ClozePromptNode).children).toMatchObject([
    { type: "text", value: "prompts" },
  ]);
});

test("two clozes", () => {
  const prompts = getPrompts(`# Heading
  
  This paragraph {has} a cloze prompt.
  
  This one has {another}.`);

  expect(prompts).toHaveLength(2);
  expect(prompts[0]).not.toEqual(prompts[1]);
});

test("QA prompt", () => {
  const prompts = getPrompts(`# Heading
  
Q. This is a question.
A. This is an answer.
  
This is another paragraph`);

  expect(prompts).toHaveLength(1);
  expect(prompts[0].type).toEqual(qaPromptType);
});

test("cloze in backlink section", () => {
  const prompts = getPrompts(`# Heading
  
## Backlinks
* [[Source link]]
\t* Some context {with a cloze} link.
`);

  expect(prompts).toHaveLength(0);
});

test("QA prompt in blockquote", () => {
  const prompts = getPrompts(`# Heading

> Q. Test.
> A. Answer.
`);

  expect(prompts).toHaveLength(1);
});
