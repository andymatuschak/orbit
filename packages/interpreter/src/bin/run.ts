import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { interpretMarkdownFiles } from "../interpret.js";

async function main(): Promise<void> {
  const noteDirectory = process.argv[2];
  const outJsonFilePath = process.argv[3];
  if (!noteDirectory || !outJsonFilePath) {
    console.error("Usage: bun run interpret /path/to/notes /path/to/json-file");
    process.exitCode = 1;
    return;
  }

  const entries = await readdir(noteDirectory, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          !entry.name.startsWith(".") &&
          entry.name.endsWith(".md"),
      )
      .map(async ({ name }) => {
        const path = join(noteDirectory, name);
        return { name, path, content: await readFile(path, "utf8") };
      }),
  );
  await writeFile(
    outJsonFilePath,
    JSON.stringify(interpretMarkdownFiles(files)),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
