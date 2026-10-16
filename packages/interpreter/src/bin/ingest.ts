import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { generateUniqueID, type TaskID } from "@withorbit/core";
import type {
  IngestibleSource,
  IngestionAssignment,
} from "@withorbit/ingester";
import { runIngest } from "@withorbit/ingester/run";
import { interpretMarkdownFiles, type MarkdownFile } from "../interpret.js";
import { stampMarkdownFile } from "../stampTaskBadges.js";

type MarkdownInputs = { paths?: readonly string[]; directory?: string };
type SourceFile = MarkdownFile & { mode: number };

/** Import source snapshots without modifying their Markdown files. */
export async function runMarkdownIngest(
  input: MarkdownInputs & {
    configurationPath?: string;
    dryRun?: boolean;
  },
) {
  const files = await readMarkdownFiles(input);
  return runIngest({
    ingestible: interpretMarkdownFiles(files),
    configurationPath: input.configurationPath,
    dryRun: input.dryRun,
  });
}

/** Prepare disposable Markdown only; accepted source text is ingested later. */
export async function prepareMarkdownStamps(
  input: MarkdownInputs & {
    configurationPath?: string;
  },
): Promise<{ stampedFileCount: number }> {
  const files = await readMarkdownFiles(input, true);
  const interpreted = interpretMarkdownFiles(files);
  const sources = interpreted.sources.filter((source) =>
    source.items.some((item) => !item.taskID),
  );
  if (!sources.length) return { stampedFileCount: 0 };
  const selected = new Set(sources);
  const pending = files.filter((_, index) =>
    selected.has(interpreted.sources[index]),
  );
  preflightStamps(pending, sources);
  // One ordinary importer plan preserves existing hash-matched identities.
  // Its mutations are not applied; generated attempts may simply be discarded.
  const plan = await runIngest({
    ingestible: { sources },
    configurationPath: input.configurationPath,
    dryRun: true,
  });
  return {
    stampedFileCount: await writeTaskBadges(pending, plan.assignments),
  };
}

async function readMarkdownFiles(
  input: MarkdownInputs,
  allowEmpty = false,
): Promise<SourceFile[]> {
  if (input.directory && input.paths?.length)
    throw new Error(
      "Supply either a notes directory or explicit Markdown paths",
    );
  const suppliedPaths = input.directory
    ? (await fs.readdir(input.directory, { withFileTypes: true }))
        .filter(
          (entry) =>
            entry.isFile() &&
            !entry.name.startsWith(".") &&
            entry.name.endsWith(".md"),
        )
        .map((entry) => path.join(input.directory!, entry.name))
    : (input.paths ?? []);
  const paths = suppliedPaths.map((file) => path.resolve(file));
  if (
    (!paths.length && !(allowEmpty && input.directory)) ||
    new Set(paths).size !== paths.length
  )
    throw new Error("Supply one or more distinct Markdown file paths");
  return Promise.all(
    paths.map(async (file) => {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || !file.endsWith(".md"))
        throw new Error(
          `Expected a regular Markdown file, not a symlink: ${file}`,
        );
      return {
        name: path.basename(file),
        path: file,
        content: await fs.readFile(file, "utf8"),
        mode: stat.mode & 0o777,
      };
    }),
  );
}

function preflightStamps(
  files: readonly SourceFile[],
  sources: readonly IngestibleSource[],
) {
  if (!files.length) return;
  // Check source layouts before touching the vault. These temporary IDs only
  // exercise insertion/round-trip validation and are never written or imported.
  const preview = sources.flatMap((source) =>
    source.items.map((item) => ({
      sourceIdentifier: source.identifier,
      itemIdentifier: item.identifier,
      taskID: item.taskID ?? (generateUniqueID() as TaskID),
    })),
  );
  for (const file of files) stampMarkdownFile(file, preview);
}

async function writeTaskBadges(
  files: readonly SourceFile[],
  assignments: readonly IngestionAssignment[],
) {
  const changes = files
    .map((file) => ({
      ...file,
      stamped: stampMarkdownFile(file, assignments),
    }))
    .filter((file) => file.content !== file.stamped);
  if (changes.length) {
    for (const file of files) await assertUnchanged(file);
    for (const file of changes) {
      const directory = await fs.mkdtemp(
        path.join(path.dirname(file.path), ".orbit-stamp-"),
      );
      try {
        const staged = path.join(directory, "note.md");
        await fs.writeFile(staged, file.stamped, { mode: file.mode });
        await assertUnchanged(file);
        await fs.rename(staged, file.path);
      } finally {
        await fs.rm(directory, { recursive: true, force: true });
      }
    }
  }
  return changes.length;
}

async function assertUnchanged(file: { path: string; content: string }) {
  const stat = await fs.lstat(file.path);
  if (!stat.isFile() || (await fs.readFile(file.path, "utf8")) !== file.content)
    throw new Error(`Markdown changed during stamp preparation: ${file.path}`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      "dry-run": { type: "boolean" },
      directory: { type: "string" },
      "prepare-stamps": { type: "boolean" },
    },
  });
  if (values["prepare-stamps"] && values["dry-run"])
    throw new Error("--prepare-stamps cannot be combined with --dry-run");
  if (!positionals.length && !values.directory)
    throw new Error(
      "Usage: bun run lab:ingest-markdown <note.md> [more.md ...] | --directory <notes-dir> [--config <private-config>] [--dry-run]\nOr: bun run lab:prepare-stamps <note.md> [more.md ...] | --directory <temporary-notes-dir> [--config <private-config>]",
    );
  if (values["prepare-stamps"]) {
    console.info(
      JSON.stringify(
        await prepareMarkdownStamps({
          paths: positionals,
          directory: values.directory,
          configurationPath: values.config,
        }),
      ),
    );
    return;
  }
  const { assignments: _assignments, ...summary } = await runMarkdownIngest({
    paths: positionals,
    directory: values.directory,
    configurationPath: values.config,
    dryRun: values["dry-run"],
  });
  console.info(JSON.stringify(summary));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Import failed");
    if (error instanceof Error && error.cause instanceof Error)
      console.error(error.cause.message);
    process.exitCode = 1;
  });
