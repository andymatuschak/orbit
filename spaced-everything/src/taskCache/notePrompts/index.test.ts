import * as fs from "fs";
import {
  clozeNodeType,
  ClozePrompt,
  processor,
  qaPromptType
} from "incremental-thinking";
import { getItemAtPath } from "../../util/tests/getItemAtPath";
import { JSONInMemoryCache } from "../JSONCache";
import { updateTaskCache } from "../taskCache";
import {
  createTaskSource,
  getPrompts,
  PromptTask,
  PromptTaskCollection,
  RegisteredPrompt
} from "./index";
import mockFS from "mock-fs";
import mdast from "mdast";
beforeAll(() => {
  console.log("avoid mocking bug"); // https://github.com/tschaub/mock-fs/issues/234
});

function getPromptsFromMarkdownString(
  markdownString: string
): RegisteredPrompt[] {
  const ast = processor.runSync(processor.parse(markdownString)) as mdast.Root;
  return getPrompts(ast);
}

test("read prompt file", async () => {
  const prompts = getPromptsFromMarkdownString(`Test {cloze} deletion {another}
    
This is a paragraph without deletions.`);
  expect(prompts).toHaveLength(1);
  const prompt = prompts[0] as ClozePrompt;
  expect(prompt.type).toEqual("cloze");
  expect(prompt.block.children).toMatchObject([
    { type: "text", value: "Test " },
    {
      type: clozeNodeType,
      children: [{ type: "text", value: "cloze" }]
    },
    { type: "text", value: " deletion " },
    {
      type: clozeNodeType,
      children: [{ type: "text", value: "another" }]
    }
  ]);
});

describe("prompt IDs", () => {
  test("cloze IDs are stable", async () => {
    const prompts = getPromptsFromMarkdownString(`Test {cloze} deletion {another} here.
      
Second paragraph.

Third paragraph with {another cloze}.`);
    expect(prompts).toHaveLength(2);
    expect(prompts[0].id).not.toEqual(prompts[1].id);

    mockFS.restore();
    const newPrompts = getPromptsFromMarkdownString(`New initial paragraph.
      
Test {cloze} deletion {another} here.

Third paragraph is edited {another cloze}.`);

    expect(prompts[0].id).toEqual(newPrompts[0].id);
    expect(prompts[1].id).not.toEqual(newPrompts[1].id);
  });

  test("QA prompt IDs are stable", async () => {
    const prompts = getPromptsFromMarkdownString(`Test paragraph.
    
Q. Foo
A. Bar`);
    expect(prompts).toHaveLength(1);

    mockFS.restore();
    const newPrompts = getPromptsFromMarkdownString(`New initial paragraph.
    
Q. Foo
A. Bar`);

    expect(prompts[0].id).toEqual(newPrompts[0].id);
  });
});

describe("activity source", () => {
  let source: ReturnType<typeof createTaskSource>;
  beforeEach(() => {
    source = createTaskSource(["/a.md", "/b.md", "/qa.md"]);
    mockFS({
      "/a.md": "Test",
      "/b.md": `# Titled note
      
Another {with} {cloze}`,
      "/qa.md": `# Test QA note
      
Q. Question
A. Answer`
    });
  });

  test("reads root", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath([], session))!;
      expect(result).toBeTruthy();
      if (result.type !== "collection") fail();
      expect(result.childIDs).toEqual(new Set(["/a.md", "/b.md", "/qa.md"]));
      expect(result.value.type).toBe("root");
    });
  });

  test("reads missing note", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath(["/c.md"], session))!;
      expect(result).toBeNull();
    });
  });

  test("reads missing note block", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath(["/a.md", "foo"], session))!;
      expect(result).toBeNull();
    });
  });

  test("reads note with prompt", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath(["/b.md"], session))!;
      expect(result).toBeTruthy();
      if (result.type !== "collection") fail();
      expect(result.childIDs.size).toBe(1);
      if (result.value.type !== "note") fail();
      expect(result.value.type === "note" && result.value.noteTitle).toEqual(
        "Titled note"
      );
      const promptID = result.childIDs.values().next().value;

      const promptBlockResult = (await getItemAtPath(
        ["/b.md", promptID],
        session
      ))!;
      expect(promptBlockResult).toBeTruthy();
      if (promptBlockResult.type !== "collection") fail();
      expect(promptBlockResult.childIDs).toEqual(
        new Set([`${promptID}-0`, `${promptID}-1`])
      );
      const promptBlock = promptBlockResult.value;
      if (promptBlock.type !== "clozeBlock") fail();
      expect(promptBlock.prompt.type).toEqual("cloze");
      expect(promptBlock.prompt.block).toMatchObject({
        type: "paragraph",
        children: [
          { type: "text", value: "Another " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "with" }]
          },
          { type: "text", value: " " },
          {
            type: clozeNodeType,
            children: [{ type: "text", value: "cloze" }]
          }
        ]
      });

      const promptResult = (await getItemAtPath(
        ["/b.md", promptID, "0"],
        session
      ))!;
      expect(promptResult).toBeTruthy();
      if (promptResult.type !== "task") fail();
      expect(promptResult.value.type).toBe("cloze");
    });
  });

  test("reads note with QA prompt", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath(["/qa.md"], session))!;
      expect(result).toBeTruthy();
      if (result.type !== "collection") fail();
      expect(result.childIDs.size).toBe(1);
      if (result.value.type !== "note") fail();
      expect(result.value.type === "note" && result.value.noteTitle).toEqual(
        "Test QA note"
      );
      const promptID = result.childIDs.values().next().value;

      const qaPromptResult = (await getItemAtPath(
        ["/qa.md", promptID],
        session
      ))!;
      expect(qaPromptResult).toBeTruthy();
      if (qaPromptResult.type !== "task") fail();
      if (qaPromptResult.value.type !== "qaPrompt") fail();
      expect(qaPromptResult.value.prompt).toMatchObject({
        type: qaPromptType,
        question: {
          type: "paragraph",
          children: [{ type: "text", value: "Question" }]
        },
        answer: {
          type: "paragraph",
          children: [{ type: "text", value: "Answer" }]
        }
      });
    });
  });

  test("reads note without prompt", async () => {
    await source.performOperations(async session => {
      const result = (await getItemAtPath(["/a.md"], session))!;
      expect(result).toBeTruthy();
      if (result.type !== "collection") fail();
      expect(result.childIDs.size).toBe(0);
    });
  });

  test("cache hit", async () => {
    const cache = JSONInMemoryCache<PromptTask, PromptTaskCollection>({
      children: {},
      type: "collection",
      value: { type: "root" }
    });
    await updateTaskCache(cache, source);

    await source.performOperations(async sourceSession => {
      return await cache.performOperations(async cacheSession => {
        const sourceResult = (await getItemAtPath(["/b.md"], sourceSession))!;
        const cacheResult = (await getItemAtPath(["/b.md"], cacheSession))!;
        expect(sourceSession.isCacheHit(cacheResult, sourceResult)).toBe(true);
      });
    });
  });

  test("cache miss", async () => {
    const cache = JSONInMemoryCache<PromptTask, PromptTaskCollection>({
      children: {},
      type: "collection",
      value: { type: "root" }
    });
    await updateTaskCache(cache, source);

    fs.writeFileSync("/b.md", "A different test");
    source = createTaskSource(["/b.md"]);
    await source.performOperations(async sourceSession => {
      return await cache.performOperations(async cacheSession => {
        const sourceResult = (await getItemAtPath(["/b.md"], sourceSession))!;
        const cacheResult = (await getItemAtPath(["/b.md"], cacheSession))!;
        expect(sourceSession.isCacheHit(cacheResult, sourceResult)).toBe(false);
      });
    });
  });
});

afterEach(() => mockFS.restore());
