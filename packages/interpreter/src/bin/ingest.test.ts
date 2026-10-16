import { afterEach, expect, it, spyOn } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TaskID } from "@withorbit/core";
import * as importer from "@withorbit/ingester/run";
import { prepareMarkdownStamps, runMarkdownIngest } from "./ingest.js";

afterEach(() => {
  importerSpy?.mockRestore();
  importerSpy = undefined;
});
let importerSpy:
  ReturnType<typeof spyOn<typeof importer, "runIngest">> | undefined;
const taskIDs = [
  "AbCdEfGhIjKlMnOpQrStUv",
  "BaCdEfGhIjKlMnOpQrStUv",
] as TaskID[];

async function withTempDirectory(test: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(
    join(tmpdir(), "orbit-stamp-preparation-test-"),
  );
  try {
    await test(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function stubPlan(beforeReturn?: () => Promise<void>) {
  importerSpy = spyOn(importer, "runIngest").mockImplementation(
    async (input) => {
      await beforeReturn?.();
      return {
        dryRun: true,
        mutationCount: 0,
        counts: {},
        assignments: [...input.ingestible.sources]
          .sort((a, b) => a.identifier.localeCompare(b.identifier))
          .flatMap((source, index) =>
            source.items.map((item) => ({
              sourceIdentifier: source.identifier,
              itemIdentifier: item.identifier,
              taskID: item.taskID ?? taskIDs[index],
            })),
          ),
      };
    },
  );
  return importerSpy;
}

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

it("does not open a vault when all prompts already have badges or there are no prompts", async () => {
  await withTempDirectory(async (directory) => {
    const marked = `Q. Front\nA. Back [☉](orbit://task/${taskIDs[0]})\n`;
    await writeFile(join(directory, "marked.md"), marked);
    await writeFile(join(directory, "prose.md"), "# Ordinary prose\n");
    const plan = stubPlan();
    expect(
      await prepareMarkdownStamps({
        directory,
        configurationPath: "/unavailable/config.json",
      }),
    ).toEqual({ stampedFileCount: 0 });
    expect(plan).not.toHaveBeenCalled();
    expect(await readFile(join(directory, "marked.md"), "utf8")).toBe(marked);
  });
});

it("an empty preparation directory completes without configuration or a vault", async () => {
  await withTempDirectory(async (directory) => {
    expect(
      await prepareMarkdownStamps({
        directory,
        configurationPath: "/unavailable/config.json",
      }),
    ).toEqual({ stampedFileCount: 0 });
  });
});

it("plans the missing-note batch once, preserves assigned IDs, and writes no other files", async () => {
  await withTempDirectory(async (directory) => {
    const qa = "Q. Front\nA. Back\n";
    const cloze = "A {cloze} prompt.\n";
    const marked = `Q. Existing\nA. Already stamped [☉](orbit://task/${taskIDs[1]})\n`;
    const first = join(directory, "a.md");
    const second = join(directory, "b.md");
    await Promise.all([
      writeFile(first, qa, { mode: 0o640 }),
      writeFile(second, cloze),
      writeFile(join(directory, "marked.md"), marked),
      writeFile(join(directory, "prose.md"), "Ordinary prose.\n"),
      writeFile(join(directory, ".hidden.md"), "[☉](orbit://invalid)"),
    ]);
    await mkdir(join(directory, "nested"));
    await writeFile(
      join(directory, "nested", "invalid.md"),
      "[☉](orbit://invalid)",
    );
    await symlink(first, join(directory, "link.md"));
    const plan = stubPlan();
    expect(
      await prepareMarkdownStamps({
        directory,
        configurationPath: "/private/config.json",
      }),
    ).toEqual({ stampedFileCount: 2 });
    expect(plan).toHaveBeenCalledTimes(1);
    expect(plan.mock.calls[0][0]).toMatchObject({
      dryRun: true,
      configurationPath: "/private/config.json",
    });
    expect(
      plan.mock.calls[0][0].ingestible.sources
        .map((source) => source.identifier.toString())
        .sort(),
    ).toEqual([first, second]);
    expect(await readFile(first, "utf8")).toBe(
      `Q. Front\nA. Back [☉](orbit://task/${taskIDs[0]})\n`,
    );
    expect(await readFile(second, "utf8")).toBe(
      `A {cloze} prompt. [☉](orbit://task/${taskIDs[1]})\n`,
    );
    expect(await readFile(join(directory, "marked.md"), "utf8")).toBe(marked);
    expect((await stat(first)).mode & 0o777).toBe(0o640);
    expect(
      (await readdir(directory)).some((name) =>
        name.startsWith(".orbit-stamp-"),
      ),
    ).toBe(false);
    expect(await prepareMarkdownStamps({ directory })).toEqual({
      stampedFileCount: 0,
    });
    expect(plan).toHaveBeenCalledTimes(1);
  });
});

it("rejects malformed metadata and unsupported layouts before planning", async () => {
  await withTempDirectory(async (directory) => {
    const note = join(directory, "note.md");
    const plan = stubPlan();
    for (const [content, error] of [
      [
        "Q. Front\nA. Back [☉](orbit://invalid)",
        "Invalid Orbit task badge URL",
      ],
      ["## A {heading} prompt ##", "Cannot safely stamp"],
    ]) {
      await writeFile(note, content);
      await expect(prepareMarkdownStamps({ paths: [note] })).rejects.toThrow(
        error,
      );
      expect(await readFile(note, "utf8")).toBe(content);
    }
    expect(plan).not.toHaveBeenCalled();
  });
});

it("does not overwrite changed source files or stamp other files from a stale batch", async () => {
  await withTempDirectory(async (directory) => {
    const first = join(directory, "a.md");
    const second = join(directory, "b.md");
    const original = "Q. Original\nA. Answer\n";
    const changed = "Q. A later human edit\nA. Keep this\n";
    await Promise.all([
      writeFile(first, original),
      writeFile(second, "A {cloze}.\n"),
    ]);
    const plan = stubPlan(() => writeFile(first, changed));
    await expect(prepareMarkdownStamps({ directory })).rejects.toThrow(
      "Markdown changed during ingestion",
    );
    expect(plan).toHaveBeenCalledTimes(1);
    expect(await readFile(first, "utf8")).toBe(changed);
    expect(await readFile(second, "utf8")).toBe("A {cloze}.\n");
    expect(
      (await readdir(directory)).some((name) =>
        name.startsWith(".orbit-stamp-"),
      ),
    ).toBe(false);
  });
});

it("leaves disposable files unstamped when planning fails", async () => {
  await withTempDirectory(async (directory) => {
    const note = join(directory, "note.md");
    const original = "Q. Front\nA. Back\n";
    await writeFile(note, original);
    const plan = stubPlan();
    plan.mockRejectedValue(new Error("Vault unavailable"));
    await expect(prepareMarkdownStamps({ directory })).rejects.toThrow(
      "Vault unavailable",
    );
    expect(await readFile(note, "utf8")).toBe(original);
    expect(await readdir(directory)).toEqual(["note.md"]);
  });
});

it("exposes preparation as a counts-only CLI and rejects import-mode options", async () => {
  await withTempDirectory(async (directory) => {
    await writeFile(join(directory, "prose.md"), "# Prose only\n");
    const cli = fileURLToPath(new URL("./ingest.ts", import.meta.url));
    for (const extra of [
      [],
      ["--dry-run"],
      ["--no-stamp"],
      ["--stamp-source", "a-source"],
    ]) {
      const child = Bun.spawn(
        [
          process.execPath,
          cli,
          "--prepare-stamps",
          "--directory",
          directory,
          "--config",
          "/unavailable/config.json",
          ...extra,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exitCode).toBe(extra.length ? 1 : 0);
      if (extra.length) expect(stderr).toContain("cannot be combined");
      else expect(JSON.parse(stdout)).toEqual({ stampedFileCount: 0 });
    }
  });
});
