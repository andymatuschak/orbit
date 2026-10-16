import {
  TaskContentType,
  type ClozeTaskContent,
  type TaskID,
} from "@withorbit/core";
import type { IngestibleItemIdentifier } from "@withorbit/ingester";
import { describe, expect, it } from "bun:test";
import { interpretMarkdownFiles } from "./interpret.js";
import { parseMarkdown, stringifyMarkdown } from "./markdown.js";
import { stripTaskBadge, withoutTaskBadges } from "./taskBadge.js";

const id = "AbCdEfGhIjKlMnOpQrSt_-" as TaskID;
const identifier = String(id) as IngestibleItemIdentifier;
const badge = `[☉](orbit://task/${id})`;
const source = (content: string) =>
  interpretMarkdownFiles([{ name: "Note", path: "/Note.md", content }])
    .sources[0];
const first = (content: string) => source(content).items[0];

describe("task identity badges", () => {
  it("recognizes both task URL forms without changing normalized Q&A content", () => {
    const original = "Q. Why **this**?\nA. Because *that*.";
    const expected = first(original);
    for (const marker of [badge, `[☉](orbit://${id})`]) {
      const actual = first(`${original} ${marker}`);
      expect(actual).toEqual({ ...expected, identifier, taskID: id });
      expect(source(`${original} ${marker}`).title).toBe(
        source(original).title,
      );
    }
    expect(expected).not.toHaveProperty("taskID");
  });

  it("strips badges from the last paragraph of multiblock answers", () => {
    const original =
      "Q.\nWhy?\n\nA.\nFirst **paragraph**.\n\nSecond paragraph.";
    expect(first(`${original} ${badge}`).spec).toEqual(first(original).spec);
    expect(first(`${original}\n\n${badge}`).spec).toEqual(first(original).spec);
  });

  it("treats hard line breaks separating a trailing badge as metadata whitespace", () => {
    for (const original of ["Q. Front\nA. Back", "A {cloze} prompt."])
      for (const separator of ["  \n", "\\\n"])
        expect(first(`${original}${separator}${badge}`).spec).toEqual(
          first(original).spec,
        );
  });

  it("supports trailing nested Markdown content without reformatting it", () => {
    const pairs = [
      ["Q. Question\nA. **Answer**", `Q. Question\nA. **Answer ${badge}**`],
      [
        "Q.\nQuestion\n\nA.\nAnswer:\n\n* Detail",
        `Q.\nQuestion\n\nA.\nAnswer:\n\n* Detail ${badge}`,
      ],
      [
        "Q.\nQuestion\n\nA.\nAnswer:\n\n> Detail",
        `Q.\nQuestion\n\nA.\nAnswer:\n\n> Detail ${badge}`,
      ],
    ];
    for (const [plain, marked] of pairs)
      expect(first(marked).spec).toEqual(first(plain).spec);
  });

  it("strips cloze metadata before calculating Markdown and UTF-16 ranges", () => {
    for (const original of [
      "A {plain} prompt.",
      "Unicode 🐙 {naïve 🌈} and {$2} with **bold**.",
      "Math $x^2$ and {a\\}b} plus [a link](https://example.com).",
      "* Nested {cloze} prompt.",
      "## A {heading} prompt",
    ]) {
      const expected = first(original);
      const actual = first(`${original} ${badge}`);
      expect(actual).toEqual({ ...expected, identifier, taskID: id });
      expect(source(`${original} ${badge}`).title).toBe(source(original).title);
      const content = actual.spec.content as ClozeTaskContent;
      expect(content.type).toBe(TaskContentType.Cloze);
      for (const component of Object.values(content.components))
        for (const range of component.ranges)
          expect(
            content.body.text.slice(
              range.startIndex,
              range.startIndex + range.length,
            ),
          ).not.toContain("☉");
    }
  });

  it("preserves ordinary links, code examples, escaped syntax, and legacy hashes", () => {
    for (const text of [
      "Q. Question\nA. [☉](https://example.com)",
      `Q. Question\nA. [Other](orbit://task/${id})`,
      `Q. Question\nA. \`${badge}\``,
      `Q. Question\nA. \\[☉](orbit://task/${id})`,
    ]) {
      const actual = first(text);
      expect(actual).not.toHaveProperty("taskID");
      expect(actual.identifier).not.toBe(id);
      if (text.includes("☉"))
        expect(JSON.stringify(actual.spec)).toContain("☉");
    }
    expect(source(`\`\`\`md\nQ. Example\nA. ${badge}\n\`\`\``).items).toEqual(
      [],
    );
  });

  it("ignores generated backlinks before checking badges", () => {
    const original = "# Note\n\nQ. Front\nA. Back";
    const withBacklinks = `${original}\n\n## Backlinks\n\nInvalid ${badge}\n\n[☉](orbit://invalid)`;
    expect(source(withBacklinks)).toEqual(source(original));
  });

  it("rejects Orbit reference badges with inline-link guidance", () => {
    for (const content of [
      `Q. Front\nA. Back [☉][task]\n\n[task]: orbit://task/${id}`,
      `A {cloze} [☉][TASK]\n\n[task]: orbit://${id}`,
      `Q. Front\nA. Back [☉][]\n\n[☉]: orbit://task/${id}`,
      `Q. Front\nA. Back [☉]\n\n[☉]: orbit://task/${id}`,
      // A definition in an excluded section still resolves a live reference.
      `Q. Front\nA. Back [☉][task]\n\n## Backlinks\n\n[task]: orbit://task/${id}`,
    ])
      expect(() => source(content)).toThrow("must use inline links");
  });

  it("leaves non-metadata references, code, and excluded references alone", () => {
    for (const content of [
      "Q. Front\nA. Back [☉][task]\n\n[task]: https://example.com",
      `Q. Front\nA. Back [other][task]\n\n[task]: orbit://task/${id}`,
      `Q. Front\nA. Back \`[☉][task]\`\n\n[task]: orbit://task/${id}`,
      `Q. Front\nA. Back\n\n## Backlinks\n\n[☉][task]\n\n[task]: orbit://task/${id}`,
    ])
      expect(first(content)).not.toHaveProperty("taskID");
  });

  it("does not mutate the parsed source tree", () => {
    const root = parseMarkdown(`A {cloze} ${badge}`);
    const snapshot = structuredClone(root);
    const result = stripTaskBadge(root.children);
    expect(root).toEqual(snapshot);
    expect(result.taskID).toBe(id);
    expect(stringifyMarkdown(result.nodes)).toBe("A {cloze}");
    expect(
      withoutTaskBadges(root, result.badge ? [result.badge] : []).children,
    ).toEqual(result.nodes);
    expect(root).toEqual(snapshot);
  });

  it("keeps note identity, headings, and ordering independent of prompt IDs", () => {
    const content = `# Title\n\nQ. Front\nA. Back ${badge}\n\nA {cloze}\n\n<!-- {BearID:ABC-123} -->`;
    const actual = source(content);
    expect<string>(actual.identifier).toBe("ABC-123");
    expect(actual.title).toBe("Title");
    expect(actual.items[0]).not.toHaveProperty("taskID");
    expect(actual.items[1].taskID).toBe(id);
  });

  it("allows the same parsed ID across sources for the ingester to diagnose", () => {
    const files = ["one", "two"].map((name) => ({
      name,
      path: `/${name}.md`,
      content: `Q. ${name}\nA. Back ${badge}`,
    }));
    expect(
      interpretMarkdownFiles(files).sources.map((s) => s.items[0].taskID),
    ).toEqual([id, id]);
  });

  it("rejects malformed IDs, URL decorations, and multiple badges", () => {
    for (const url of [
      "orbit://task/short",
      `orbit://task/${id}/`,
      `orbit://task/${id}?account=other`,
      `orbit://task/${id}#fragment`,
      `orbit://other/${id}`,
      `orbit:task/${id}`,
    ])
      expect(() => first(`Q. Front\nA. Back [☉](${url})`)).toThrow(
        "Invalid Orbit task badge URL",
      );
    expect(() => first(`Q. Front\nA. Back ${badge} ${badge}`)).toThrow(
      "multiple Orbit task badges",
    );
  });

  it("rejects misplaced and detached metadata instead of silently importing new tasks", () => {
    for (const content of [
      `Q. Front ${badge}\nA. Back`,
      `Q. Front\nA. Back ${badge} trailing text`,
      `Q. Front\nA. Back\n\n${badge}`,
      `A {cloze} ${badge} trailing text`,
      `A {cloze}\n\n${badge}`,
      `{${badge}}`,
      `{answer ${badge}}`,
      `Q. Front\nA. {answer ${badge}}`,
      `Ordinary prose ${badge}`,
      badge,
    ])
      expect(() => source(content)).toThrow("Orbit task badge");
  });
});
