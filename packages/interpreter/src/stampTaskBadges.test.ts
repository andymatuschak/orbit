import type { TaskID } from "@withorbit/core";
import type {
  IngestionAssignment,
  IngestibleItemIdentifier,
  IngestibleSourceIdentifier,
} from "@withorbit/ingester";
import { describe, expect, it } from "bun:test";
import { interpretMarkdownFiles, type MarkdownFile } from "./interpret.js";
import { stampMarkdownFile } from "./stampTaskBadges.js";

const ids = [
  "AbCdEfGhIjKlMnOpQrSt_-",
  "BaCdEfGhIjKlMnOpQrSt_-",
  "CaCdEfGhIjKlMnOpQrSt_-",
] as TaskID[];
const badge = (id: TaskID) => `[☉](orbit://task/${id})`;
const file = (content: string): MarkdownFile => ({
  name: "Note.md",
  path: "/notes/Note.md",
  content,
});
const source = (note: MarkdownFile) =>
  interpretMarkdownFiles([note]).sources[0];
const assignments = (note: MarkdownFile): IngestionAssignment[] => {
  const interpreted = source(note);
  return interpreted.items.map((item, index) => ({
    sourceIdentifier: interpreted.identifier,
    itemIdentifier: item.identifier,
    taskID: item.taskID ?? ids[index],
  }));
};

describe("source-preserving task stamping", () => {
  it("appends the accepted TaskID without rewriting surrounding Markdown", () => {
    const original =
      "---\ntag: testing\n---\n# A  title\n\nQ. Why **this**?\nA. Because *that*.\n\nOrdinary prose.\n\n<!-- {BearID:ABC-123} -->\n";
    const note = file(original);
    const assigned = assignments(note);
    const stamped = stampMarkdownFile(note, assigned);
    expect(stamped).toBe(
      original.replace("Because *that*.", `Because *that*. ${badge(ids[0])}`),
    );
    const actual = source({ ...note, content: stamped });
    expect(actual.items[0].taskID).toBe(ids[0]);
    expect(actual.items[0].spec).toEqual(source(note).items[0].spec);
    expect<string>(actual.identifier).toBe("ABC-123");
  });

  it("uses original UTF-16 offsets and preserves CRLF, Unicode, escapes, and footer", () => {
    const original =
      "# 🐙\r\n\r\nQ. &amp; *café* 😀\r\nA. An &#97;nswer\\!\r\n\r\n<!-- {BearID:ABC-123} -->\r\n";
    const note = file(original);
    expect(stampMarkdownFile(note, assignments(note))).toBe(
      original.replace("&#97;nswer\\!", `&#97;nswer\\! ${badge(ids[0])}`),
    );
  });

  it("stamps mixed prompt types right-to-left in source order, not ingestion order", () => {
    const original =
      "Q. First\nA. Answer\n\nA {cloze} prompt.\n\nQ. Second\nA. Another";
    const note = file(original);
    const stamped = stampMarkdownFile(note, assignments(note));
    // Legacy ingestion order is cloze, then both QAs.
    expect(stamped).toBe(
      `Q. First\nA. Answer ${badge(ids[1])}\n\nA {cloze} prompt. ${badge(ids[0])}\n\nQ. Second\nA. Another ${badge(ids[2])}`,
    );
    expect(
      source({ ...note, content: stamped }).items.map((item) => item.spec),
    ).toEqual(source(note).items.map((item) => item.spec));
  });

  it("supports multiblock answers ending in paragraphs, lists, quotes, and code fences", () => {
    for (const ending of [
      "Second paragraph.",
      "* A detail",
      "> A quotation",
      "```js\nconst a = 1;\n```",
      "$$\nx^2\n$$",
    ]) {
      const note = file(
        `Q.\nA question\n\nA.\nAn answer\n\n${ending}\n\n---\n\nAfterwards.`,
      );
      const stamped = stampMarkdownFile(note, assignments(note));
      const separator =
        ending.startsWith("```") || ending.startsWith("$$") ? "\n\n" : " ";
      expect(stamped).toBe(
        note.content.replace(
          ending,
          () => `${ending}${separator}${badge(ids[0])}`,
        ),
      );
      expect(source({ ...note, content: stamped }).items[0].spec).toEqual(
        source(note).items[0].spec,
      );
    }
  });

  it("preserves CRLF when a fenced answer needs its own badge paragraph", () => {
    const note = file("Q. Front\r\nA.\r\nBack\r\n\r\n```\r\nexample\r\n```");
    expect(stampMarkdownFile(note, assignments(note))).toBe(
      `${note.content}\r\n\r\n${badge(ids[0])}`,
    );
  });

  it("stamps the final answer block before BearID without changing footer bytes", () => {
    for (const newline of ["\n", "\r\n"])
      for (const ending of [
        "Second paragraph.",
        "* Final point",
        "> Final quotation",
        "```text\nFinal example\n```",
        "$$\nx^2\n$$",
      ]) {
        const content = `# Source\n\nQ. Question\nA.\nFirst paragraph.\n\n${ending}`;
        const footer = "\n\n<!-- {BearID:ABC-123} -->\n";
        const note = file((content + footer).replaceAll("\n", newline));
        const separate = ending.startsWith("```") || ending.startsWith("$$");
        const expected =
          `${content}${separate ? "\n\n" : " "}${badge(ids[0])}${footer}`.replaceAll(
            "\n",
            newline,
          );
        const stamped = stampMarkdownFile(note, assignments(note));
        expect(stamped).toBe(expected);
        const updated = { ...note, content: stamped };
        expect(source(updated).items[0].spec).toEqual(
          source(note).items[0].spec,
        );
        expect(JSON.stringify(source(updated).items[0].spec)).not.toContain(
          "BearID",
        );
        expect(stampMarkdownFile(updated, assignments(updated))).toBe(stamped);
      }
  });

  it("supports nested clozes and leaves unrelated text byte-identical", () => {
    for (const original of [
      "* A {listed} prompt.",
      "> A {quoted} prompt.",
      "## A {heading} prompt",
      "A **{formatted}** prompt.",
    ]) {
      const note = file(original);
      expect(stampMarkdownFile(note, assignments(note))).toBe(
        `${original} ${badge(ids[0])}`,
      );
    }
  });

  it("keeps an existing badge byte-identical and repeats without changes", () => {
    const original = `Q. First\nA. Answer [☉](orbit://${ids[0]})\n\nQ. Second\nA. Another`;
    const note = file(original);
    const stamped = stampMarkdownFile(note, assignments(note));
    expect(stamped).toBe(`${original} ${badge(ids[1])}`);
    const updated = { ...note, content: stamped };
    expect(stampMarkdownFile(updated, assignments(updated))).toBe(stamped);
  });

  it("ignores assignments for other sources and leaves notes without prompts alone", () => {
    const note = file("Q. Front\nA. Back");
    const unrelated = {
      ...assignments(note)[0],
      sourceIdentifier: "/other.md" as IngestibleSourceIdentifier,
    };
    expect(stampMarkdownFile(note, [...assignments(note), unrelated])).toBe(
      `${note.content} ${badge(ids[0])}`,
    );
    const prose = file("# Ordinary prose\n\nNot a question.");
    expect(stampMarkdownFile(prose, [unrelated])).toBe(prose.content);
  });

  it("rejects absent, extra, invalid, and duplicate assignments", () => {
    const note = file("Q. Front\nA. Back");
    const assigned = assignments(note);
    expect(() => stampMarkdownFile(note, [])).toThrow(
      "Missing task assignment",
    );
    expect(() =>
      stampMarkdownFile(note, [
        { ...assigned[0], taskID: "invalid" as TaskID },
      ]),
    ).toThrow("Invalid task ID");
    expect(() => stampMarkdownFile(note, [...assigned, assigned[0]])).toThrow(
      "Duplicate task assignment",
    );
    expect(() =>
      stampMarkdownFile(note, [
        ...assigned,
        {
          ...assigned[0],
          itemIdentifier: "extra" as IngestibleItemIdentifier,
          taskID: ids[1],
        },
      ]),
    ).toThrow("do not match the prompts");
    expect(() =>
      stampMarkdownFile(note, [
        ...assigned,
        { ...assigned[0], itemIdentifier: "extra" as IngestibleItemIdentifier },
      ]),
    ).toThrow("Duplicate task assignment");
  });

  it("rejects an assignment that changes an existing badge", () => {
    const note = file(`Q. Front\nA. Back ${badge(ids[0])}`);
    expect(() =>
      stampMarkdownFile(note, [{ ...assignments(note)[0], taskID: ids[1] }]),
    ).toThrow("does not match an existing badge");
  });

  it("rejects ambiguous duplicated prompts rather than assigning an arbitrary ID", () => {
    const note = file("Q. Same\nA. Same\n\nQ. Same\nA. Same");
    expect(() => stampMarkdownFile(note, assignments(note))).toThrow(
      "Duplicate task assignment",
    );
  });

  it("rejects Markdown layouts whose appended badge would alter learning content", () => {
    const note = file("## A {heading} prompt ##");
    expect(() => stampMarkdownFile(note, assignments(note))).toThrow(
      "Cannot safely stamp",
    );
  });
});
