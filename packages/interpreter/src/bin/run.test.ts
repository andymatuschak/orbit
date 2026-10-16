import type { Ingestible } from "@withorbit/ingester";
import { expect, it } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliPath = fileURLToPath(new URL("./run.ts", import.meta.url));

async function runCLI(...args: string[]) {
  const child = Bun.spawn([process.execPath, cliPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function withTempDirectory(test: (directory: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "orbit-interpreter-test-"));
  try {
    await test(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("requires both positional arguments", async () => {
  for (const args of [[], ["/unused"]]) {
    const result = await runCLI(...args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Usage: bun run interpret /path/to/notes /path/to/json-file\n",
    );
  }
});

it("writes JSON for immediate, visible Markdown files without modifying them", async () => {
  await withTempDirectory(async (directory) => {
    const notes = join(directory, "notes");
    const nested = join(notes, "nested");
    await mkdir(nested, { recursive: true });
    const markdown = "# Example\n\nQ. Question\nA. Answer\n";
    await Promise.all([
      writeFile(join(notes, "example.md"), markdown),
      writeFile(join(notes, "empty.md"), ""),
      writeFile(join(notes, ".hidden.md"), markdown),
      writeFile(join(notes, "uppercase.MD"), markdown),
      writeFile(join(notes, "text.txt"), markdown),
      writeFile(join(nested, "nested.md"), markdown),
    ]);
    const output = join(directory, "output.json");
    const result = await runCLI(notes, output);
    expect(result).toEqual({ exitCode: 0, stdout: "", stderr: "" });

    const ingestible: Ingestible = JSON.parse(await readFile(output, "utf8"));
    expect(ingestible.sources).toHaveLength(2);
    const example = ingestible.sources.find(
      (source) => source.title === "Example",
    );
    expect(example?.identifier.toString()).toBe(join(notes, "example.md"));
    expect(example?.items).toHaveLength(1);
    expect(example?.items[0].identifier.toString()).toBe(
      "Opkh3stAIIc1KOXWg2FeT+rp4fAJQ6vLEVNuN/f1Poc=",
    );
    expect(
      ingestible.sources.find((source) => source.title === "empty.md")?.items,
    ).toEqual([]);
    expect(await readFile(join(notes, "example.md"), "utf8")).toBe(markdown);
  });
});

it("reports filesystem failures with a nonzero exit status", async () => {
  await withTempDirectory(async (directory) => {
    const missingDirectory = await runCLI(
      join(directory, "missing"),
      join(directory, "output.json"),
    );
    expect(missingDirectory.exitCode).toBe(1);
    expect(missingDirectory.stderr).toContain("ENOENT");

    const missingOutputParent = await runCLI(
      directory,
      join(directory, "missing", "output.json"),
    );
    expect(missingOutputParent.exitCode).toBe(1);
    expect(missingOutputParent.stderr).toContain("ENOENT");
  });
});
