import fs from "node:fs/promises";

/** Finish immutable files and directory entries before publishing their pointer. */
export async function writeSynced(
  filename: string,
  contents: string | Uint8Array,
  flags: "w" | "wx" = "wx",
): Promise<void> {
  const file = await fs.open(filename, flags, 0o600);
  try {
    await file.writeFile(contents);
    await file.sync();
  } finally {
    await file.close();
  }
}

export async function syncDirectory(directory: string): Promise<void> {
  const file = await fs.open(directory, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}
