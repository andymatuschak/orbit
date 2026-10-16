import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { generateUniqueID, type TaskID } from "@withorbit/core";
import { runIngest } from "@withorbit/ingester/run";
import { interpretMarkdownFiles } from "../interpret.js";
import { stampMarkdownFile } from "../stampTaskBadges.js";

/** Import all supplied notes, optionally limiting source writeback by source ID. */
export async function runMarkdownIngest(input: {
  paths?: readonly string[];
  directory?: string;
  stampSourceIdentifiers?: readonly string[];
  configurationPath?: string;
  dryRun?: boolean;
}) {
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
  if (!paths.length || new Set(paths).size !== paths.length)
    throw new Error("Supply one or more distinct Markdown file paths");
  const files = await Promise.all(
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
  const ingestible = interpretMarkdownFiles(files);
  const selectedSources = input.stampSourceIdentifiers
    ? new Set(input.stampSourceIdentifiers)
    : null;
  const stampFiles = files.filter(
    (_, index) =>
      !selectedSources ||
      selectedSources.has(ingestible.sources[index].identifier),
  );
  // Check source layouts before touching the vault. These temporary IDs only
  // exercise insertion/round-trip validation and are never written or imported.
  const preview = ingestible.sources
    .filter(
      (source) => !selectedSources || selectedSources.has(source.identifier),
    )
    .flatMap((source) =>
      source.items.map((item) => ({
        sourceIdentifier: source.identifier,
        itemIdentifier: item.identifier,
        taskID: item.taskID ?? (generateUniqueID() as TaskID),
      })),
    );
  for (const file of stampFiles) stampMarkdownFile(file, preview);

  const result = await runIngest({
    ingestible,
    configurationPath: input.configurationPath,
    dryRun: input.dryRun,
  });
  const changes = stampFiles
    .map((file) => ({
      ...file,
      stamped: stampMarkdownFile(file, result.assignments),
    }))
    .filter((file) => file.content !== file.stamped);
  if (!input.dryRun && changes.length) {
    // The vault can be retried independently if source writeback fails. Its
    // content-hash metadata remains usable until the badge is adopted next run.
    try {
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
    } catch (error) {
      throw new Error(
        "The vault import synced, but source stamping did not finish; resolve the file error and retry",
        { cause: error },
      );
    }
  }
  return {
    ...result,
    stampedFileCount: input.dryRun ? 0 : changes.length,
  };
}

async function assertUnchanged(file: { path: string; content: string }) {
  const stat = await fs.lstat(file.path);
  if (!stat.isFile() || (await fs.readFile(file.path, "utf8")) !== file.content)
    throw new Error(`Markdown changed during ingestion: ${file.path}`);
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: "string" },
      "dry-run": { type: "boolean" },
      directory: { type: "string" },
      "stamp-source": { type: "string", multiple: true },
      "no-stamp": { type: "boolean" },
    },
  });
  if (values["no-stamp"] && values["stamp-source"])
    throw new Error("--no-stamp cannot be combined with --stamp-source");
  if (!positionals.length && !values.directory)
    throw new Error(
      "Usage: bun run lab:ingest-markdown <note.md> [more.md ...] | --directory <notes-dir> [--stamp-source <source-id> ... | --no-stamp] [--config <private-config>] [--dry-run]",
    );
  const { assignments: _assignments, ...summary } = await runMarkdownIngest({
    paths: positionals,
    directory: values.directory,
    stampSourceIdentifiers: values["no-stamp"] ? [] : values["stamp-source"],
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
