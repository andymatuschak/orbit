import mdast from "mdast";
import { processor } from "../markdown.js";
import { getNoteTitle } from "./getNoteTitle.js";

describe("getting note title", () => {
  test("extracts title heading", () => {
    const input = `# Test node
    
Another paragraph`;
    const tree = processor.runSync(processor.parse(input)) as mdast.Root;
    expect(getNoteTitle(tree)).toEqual("Test node");
  });

  test("extracts title non-heading", () => {
    const input = `Non-heading title
    
More text`;
    const tree = processor.runSync(processor.parse(input)) as mdast.Root;
    expect(getNoteTitle(tree)).toEqual("Non-heading title");
  });

  test("doesn't extract non-title", () => {
    const tree = processor.runSync(processor.parse("")) as mdast.Root;
    expect(getNoteTitle(tree)).toBeNull();
  });

  test("skips frontmatter", () => {
    const input = `---
x: y
---
# Title`;
    const tree = processor.runSync(processor.parse(input)) as mdast.Root;
    expect(getNoteTitle(tree)).toEqual("Title");
  });
});
