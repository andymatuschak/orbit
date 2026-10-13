import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface UpdateAsset {
  hash: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

export interface UpdateManifest {
  id: string;
  createdAt: string;
  runtimeVersion: string;
  launchAsset: UpdateAsset;
  assets: UpdateAsset[];
  metadata: Record<string, string>;
  extra: { expoClient: Record<string, unknown> };
}

export interface CheckpointSelection {
  current: string;
  previous?: string;
}

export const checkpointIDPattern =
  /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/;
export const runtimeVersionPattern = /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,127}$/;
export const maximumUpdateAssetBytes = 256 * 1024 * 1024;

export function privateUpdateOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid private update origin");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !(
      (local && ["http:", "https:"].includes(url.protocol)) ||
      (url.protocol === "https:" && url.hostname.endsWith(".ts.net"))
    )
  ) {
    throw new Error(
      "Update origin must be loopback or private Tailscale HTTPS, without a path or credentials",
    );
  }
  return url.origin;
}

// Atomic replacement is the only publication operation. A failed export/copy
// leaves the previously selected checkpoint intact, never a partial update.
export async function publishCheckpoint(options: {
  exportDirectory: string;
  updatesRoot: string;
  origin: string;
  runtimeVersion: string;
  expoConfig: Record<string, unknown>;
}): Promise<UpdateManifest> {
  const origin = privateUpdateOrigin(options.origin);
  if (!runtimeVersionPattern.test(options.runtimeVersion)) {
    throw new Error("A concrete native runtime version is required");
  }
  const exportRoot = await fs.realpath(options.exportDirectory);
  if (
    (await fs.stat(path.join(exportRoot, "metadata.json"))).size >
    2 * 1024 * 1024
  ) {
    throw new Error("Export metadata exceeds 2 MB");
  }
  const metadata = JSON.parse(
    await fs.readFile(path.join(exportRoot, "metadata.json"), "utf8"),
  );
  const ios = metadata.fileMetadata?.ios;
  if (
    metadata.version !== 0 ||
    metadata.bundler !== "metro" ||
    typeof ios?.bundle !== "string" ||
    !Array.isArray(ios.assets)
  ) {
    throw new Error("Expected a complete Expo iOS export with metadata.json");
  }

  await fs.mkdir(options.updatesRoot, { recursive: true });
  const selectionPath = path.join(options.updatesRoot, "current.json");
  const previous = await readSelection(options.updatesRoot);
  const id = randomUUID();
  const staging = await fs.mkdtemp(
    path.join(options.updatesRoot, ".preparing-"),
  );
  const published = path.join(options.updatesRoot, id);
  const pointer = path.join(options.updatesRoot, `.current-${id}.json`);
  try {
    const copyAsset = async (
      filePath: string,
      ext: string,
      launch: boolean,
    ): Promise<UpdateAsset> => {
      if (
        typeof filePath !== "string" ||
        path.isAbsolute(filePath) ||
        filePath.split(/[\\/]/).includes("..") ||
        !/^[a-z0-9]+$/.test(ext)
      ) {
        throw new Error("Invalid exported asset path or extension");
      }
      const source = await fs.realpath(path.join(exportRoot, filePath));
      if (!source.startsWith(`${exportRoot}${path.sep}`))
        throw new Error("Export asset escapes its directory");
      if ((await fs.stat(source)).size > maximumUpdateAssetBytes) {
        throw new Error("Export asset exceeds 256 MB");
      }
      const bytes = await fs.readFile(source);
      const digest = createHash("sha256").update(bytes).digest();
      const filename = `${digest.toString("hex")}.${ext}`;
      await durableWrite(path.join(staging, filename), bytes);
      return {
        hash: digest.toString("base64url"),
        // Metro asset keys are content MD5s, not the SHA-256 integrity hashes.
        key: createHash("md5").update(bytes).digest("hex"),
        contentType: launch ? "application/javascript" : assetContentType(ext),
        ...(!launch && { fileExtension: `.${ext}` }),
        url: `${origin}/updates/assets/${id}/${filename}`,
      };
    };
    const assets: UpdateAsset[] = [];
    for (const asset of ios.assets)
      assets.push(await copyAsset(asset.path, asset.ext, false));
    const manifest: UpdateManifest = {
      id,
      createdAt: new Date().toISOString(),
      runtimeVersion: options.runtimeVersion,
      launchAsset: await copyAsset(ios.bundle, "bundle", true),
      assets,
      metadata: {},
      extra: { expoClient: options.expoConfig },
    };
    await durableWrite(
      path.join(staging, "manifest.json"),
      JSON.stringify(manifest),
    );
    await fs.rename(staging, published);
    await durableWrite(
      pointer,
      JSON.stringify({
        current: id,
        ...(previous && { previous: previous.current }),
      }),
    );
    await fs.rename(pointer, selectionPath);
    await syncDirectory(options.updatesRoot);
    // Published assets are immutable and retained: an older manifest may still
    // be downloading. Only current/previous are offered for new checks.
    return manifest;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
    await fs.rm(pointer, { force: true });
  }
}

export async function readSelection(
  updatesRoot: string,
): Promise<CheckpointSelection | undefined> {
  let text: string;
  try {
    text = await fs.readFile(path.join(updatesRoot, "current.json"), "utf8");
  } catch (error) {
    if (isMissingFile(error)) return undefined;
    throw error;
  }
  const selection = JSON.parse(text);
  if (
    !checkpointIDPattern.test(selection.current) ||
    (selection.previous !== undefined &&
      !checkpointIDPattern.test(selection.previous))
  ) {
    throw new Error("Invalid checkpoint selection");
  }
  return selection;
}

export function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function durableWrite(
  filename: string,
  bytes: string | Uint8Array,
): Promise<void> {
  const file = await fs.open(filename, "w", 0o600);
  try {
    await file.writeFile(bytes);
    await file.sync();
  } finally {
    await file.close();
  }
}

async function syncDirectory(directory: string): Promise<void> {
  const file = await fs.open(directory, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
}

function assetContentType(ext: string): string {
  const types: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    ttf: "font/ttf",
    otf: "font/otf",
    woff: "font/woff",
    woff2: "font/woff2",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "video/mp4",
    json: "application/json",
    js: "application/javascript",
    html: "text/html",
  };
  return types[ext] ?? "application/octet-stream";
}
