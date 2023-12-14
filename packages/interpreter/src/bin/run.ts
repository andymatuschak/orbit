import { Ingestible } from "@withorbit/ingester";
import fs from "fs";
import path from "path";
import { MarkdownInterpreter } from "../interpreters/index.js";
import { InterpretableFile, Interpreter } from "../interpreter.js";
import { CryptoBase64Hasher } from "../hasher/CryptoBase64Hasher.js";

async function run(
  noteDirectory: string,
  interpreter: Interpreter,
): Promise<Ingestible> {
  // read and parse each file in the directory
  const fileNames = await listNoteFiles(noteDirectory);
  const files = await Promise.all(
    fileNames.map(async (fileName): Promise<InterpretableFile> => {
      const filePath = path.join(noteDirectory, fileName);
      const content = await readFile(filePath);
      return {
        name: fileName,
        path: filePath,
        content,
      };
    }),
  );
  return interpreter.interpret(files);
}

async function listNoteFiles(folderPath: string): Promise<string[]> {
  const noteDirectoryEntries = await fs.promises.readdir(folderPath, {
    withFileTypes: true,
  });
  return noteDirectoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        entry.name.endsWith(".md"),
    )
    .map((entry) => entry.name);
}

async function readFile(path: string): Promise<string> {
  const buffer = await fs.promises.readFile(path);
  return buffer.toString("utf-8");
}

(async () => {
  // ensure that the arguments are defined
  const noteDirectory = process.argv[2];
  const outJsonFilePath = process.argv[3];
  if (!noteDirectory || !outJsonFilePath) {
    console.error("Usage: bun run interpret /path/to/notes /path/to/json-file");
    process.exit(1);
  }

  const interpreter = new MarkdownInterpreter(CryptoBase64Hasher);
  const ingestible = await run(noteDirectory, interpreter);
  await fs.promises.writeFile(outJsonFilePath, JSON.stringify(ingestible));
})()
  .then(() => {
    process.exit(0);
  })
  .catch(console.error);
