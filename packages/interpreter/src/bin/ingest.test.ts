import { expect, it } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMarkdownIngest } from "./ingest.js";

it("requires distinct explicit files before connecting to the vault", async () => {
  for (const paths of [[], ["/unused.md", "/unused.md"]])
    await expect(runMarkdownIngest({ paths })).rejects.toThrow(
      "distinct Markdown file paths",
    );
});

it("rejects mixed directory and file inputs before connecting", async () => {
  await expect(
    runMarkdownIngest({ directory: "/unused", paths: ["/unused.md"] }),
  ).rejects.toThrow("either a notes directory or explicit Markdown paths");
});

it("rejects symlinks and unsupported stamping layouts before importing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "orbit-stamping-test-"));
  try {
    const note = join(directory, "note.md");
    const link = join(directory, "link.md");
    const content = "## A {heading} prompt ##";
    await writeFile(note, content);
    await symlink(note, link);
    await expect(runMarkdownIngest({ paths: [link] })).rejects.toThrow(
      "regular Markdown file",
    );
    await expect(runMarkdownIngest({ paths: [note] })).rejects.toThrow(
      "Cannot safely stamp",
    );
    expect(await readFile(note, "utf8")).toBe(content);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
