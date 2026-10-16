import { expect, test } from "bun:test";
import {
  findClozeBlocks,
  getBearID,
  getNoteTitle,
  parseMarkdown,
  sourceRange,
  stringifyMarkdown,
  withoutBacklinks,
} from "./markdown.js";

test("clozes are grouped by their closest block without parent proxies", () => {
  const root = parseMarkdown(
    "# Heading\n\nThis {has two} cloze {blanks}.\n\nAnother {paragraph}.\n\n> A {quote}.\n\n* A {list item}.\n* No blank.",
  );
  expect(
    findClozeBlocks(root).map((block) => stringifyMarkdown([block])),
  ).toEqual([
    "This {has two} cloze {blanks}.",
    "Another {paragraph}.",
    "A {quote}.",
    "A {list item}.",
  ]);
});

test("backlinks exclusion keeps the next section and does not mutate the document", () => {
  const root = parseMarkdown(
    "# Title\n\nBefore {one}.\n\n## Backlinks\n\n[[Source]] with {ignored}.\n\n### Nested\n\nAlso {ignored}.\n\n## After\n\nAfter {two}.",
  );
  const original = structuredClone(root);
  const filtered = withoutBacklinks(root);
  expect(stringifyMarkdown(filtered.children)).toBe(
    "# Title\n\nBefore {one}.\n\n## After\n\nAfter {two}.",
  );
  expect(findClozeBlocks(filtered)).toHaveLength(2);
  expect(root).toEqual(original);
});

test("backlinks headings match plain text, case-insensitively", () => {
  const filtered = withoutBacklinks(
    parseMarkdown(
      "# Title\n\n## **BACKLINKS**\n\n{ignored}\n\n# Later\n\n{included}",
    ),
  );
  expect(findClozeBlocks(filtered)).toHaveLength(1);
  expect(stringifyMarkdown(filtered.children)).toContain("# Later");
});

test.each([
  ["# Title\n\nMore text", "Title"],
  ["Non-heading title\n\nMore text", "Non-heading title"],
  ["---\nx: y\n---\n# Title", "Title"],
  ["# An *emphasized* title", "An *emphasized* title"],
  ["", null],
  ["---\nx: y\n---", null],
])("title metadata: %s", (source, title) => {
  expect(getNoteTitle(parseMarkdown(source))).toBe(title);
});

test("Bear IDs are read from ordinary HTML without replacing AST nodes", () => {
  const id = "860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA";
  const source = `# Title\n\n<!-- {BearID:${id}} -->`;
  const root = parseMarkdown(source);
  expect(getBearID(root)).toBe(id);
  expect(root.children.at(-1)?.type).toBe("html");
  expect(stringifyMarkdown(root.children)).toBe(source);
  expect(
    getBearID(parseMarkdown(`${source}\n\n<!-- {BearID:ABC-123} -->`)),
  ).toBeUndefined();
  expect(getBearID(parseMarkdown("# Title"))).toBeUndefined();
  expect(
    getBearID(parseMarkdown("```html\n<!-- {BearID:ABC-123} -->\n```")),
  ).toBeUndefined();
  expect(
    getBearID(parseMarkdown("`<!-- {BearID:ABC-123} -->`")),
  ).toBeUndefined();
});

test("original source spans are distinct from normalized Markdown offsets", () => {
  const source = "# Title\n\nA __bold__ {blank}.";
  const [block] = findClozeBlocks(parseMarkdown(source));
  const range = sourceRange(block);
  expect(source.slice(range.start, range.end)).toBe("A __bold__ {blank}.");
  expect(stringifyMarkdown([block])).toBe("A **bold** {blank}.");
});
