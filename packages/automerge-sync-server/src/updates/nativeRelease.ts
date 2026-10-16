import { constants, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { privateUpdateOrigin } from "./checkpoint.js";
import { syncDirectory, writeSynced } from "./durability.js";

export interface NativeRelease {
  buildNumber: string;
  version: string;
  bundleIdentifier: string;
  manifestURL: string;
}

const buildNumberPattern = /^[1-9][0-9]{0,17}$/;
export const maximumNativeReleaseBytes = 1024 * 1024 * 1024;

// A build becomes visible only after both immutable files are complete. The
// separately replaced descriptor lets existing installs discover a new runtime.
export async function publishNativeRelease(options: {
  ipaPath: string;
  updatesRoot: string;
  origin: string;
  buildNumber: string;
  version: string;
  bundleIdentifier: string;
}): Promise<NativeRelease> {
  const origin = privateUpdateOrigin(options.origin);
  const release = validateRelease({
    buildNumber: options.buildNumber,
    version: options.version,
    bundleIdentifier: options.bundleIdentifier,
    manifestURL: `${origin}/updates/native/${options.buildNumber}/manifest.plist`,
  });
  const source = await fs.open(
    options.ipaPath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let staging: string | undefined;
  let pointer: string | undefined;
  try {
    const sourceStat = await source.stat();
    if (
      !sourceStat.isFile() ||
      sourceStat.size === 0 ||
      sourceStat.size > maximumNativeReleaseBytes
    )
      throw new Error(
        "Native release must be a regular IPA no larger than 1 GiB",
      );
    await fs.mkdir(options.updatesRoot, { recursive: true });
    const root = await fs.realpath(options.updatesRoot);
    const nativeDirectory = path.join(root, "native");
    await fs.mkdir(nativeDirectory, { recursive: true });
    if ((await fs.realpath(nativeDirectory)) !== nativeDirectory)
      throw new Error("Symlinked native update directory");
    const published = path.join(nativeDirectory, release.buildNumber);
    try {
      await fs.lstat(published);
      throw new Error(
        "Native build is already published; use a new build number",
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    staging = await fs.mkdtemp(path.join(nativeDirectory, ".preparing-"));
    const destinationPath = path.join(staging, "Orbit.ipa");
    await pipeline(
      source.createReadStream({ autoClose: false }),
      createWriteStream(destinationPath, { flags: "wx", mode: 0o600 }),
    );
    const destination = await fs.open(destinationPath, "r");
    try {
      if ((await destination.stat()).size !== sourceStat.size)
        throw new Error("IPA changed during publication");
      await destination.sync();
    } finally {
      await destination.close();
    }
    await writeSynced(
      path.join(staging, "manifest.plist"),
      installManifest(release),
    );
    await syncDirectory(staging);
    await fs.rename(staging, published);
    await syncDirectory(nativeDirectory);
    pointer = path.join(root, `.native-${path.basename(staging)}.json`);
    await writeSynced(pointer, JSON.stringify(release));
    await fs.rename(pointer, path.join(root, "native.json"));
    await syncDirectory(root);
    return release;
  } finally {
    await source.close();
    if (staging) await fs.rm(staging, { recursive: true, force: true });
    if (pointer) await fs.rm(pointer, { force: true });
  }
}

export async function nativeUpdateResponse(
  request: IncomingMessage,
  response: ServerResponse,
  directory: string,
  route: string,
): Promise<void> {
  if (route === "/updates/native.json") {
    const file = await openArtifact(path.join(directory, "native.json"));
    let release: NativeRelease;
    try {
      if ((await file.stat()).size > 64 * 1024)
        throw new Error("Invalid native release descriptor");
      release = validateRelease(JSON.parse(await file.readFile("utf8")));
    } finally {
      await file.close();
    }
    const body = JSON.stringify(release);
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }
  const match =
    /^\/updates\/native\/([1-9][0-9]{0,17})\/(manifest\.plist|Orbit\.ipa)$/.exec(
      route,
    );
  if (!match) {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end();
    return;
  }
  const file = await openArtifact(
    path.join(directory, "native", match[1], match[2]),
  );
  try {
    const size = (await file.stat()).size;
    const ipa = match[2] === "Orbit.ipa";
    if (size === 0 || size > (ipa ? maximumNativeReleaseBytes : 64 * 1024))
      throw new Error("Invalid native update artifact size");
    response.setHeader(
      "Content-Type",
      ipa ? "application/octet-stream" : "text/xml; charset=utf-8",
    );
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (ipa) response.setHeader("Accept-Ranges", "bytes");
    const range = ipa && request.method === "GET" && request.headers.range;
    const bounds = range ? byteRange(range, size) : [0, size - 1];
    if (!bounds) {
      response.writeHead(416, {
        "Content-Range": `bytes */${size}`,
        "Content-Length": 0,
      });
      response.end();
      return;
    }
    const [start, end] = bounds;
    response.statusCode = range ? 206 : 200;
    response.setHeader("Content-Length", end - start + 1);
    if (range)
      response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
    if (request.method === "HEAD") response.end();
    else
      await pipeline(
        file.createReadStream({ start, end, autoClose: false }),
        response,
      );
  } finally {
    await file.close();
  }
}

function validateRelease(value: NativeRelease): NativeRelease {
  if (
    !value ||
    typeof value.buildNumber !== "string" ||
    !buildNumberPattern.test(value.buildNumber) ||
    !Number.isSafeInteger(Number(value.buildNumber)) ||
    typeof value.version !== "string" ||
    !value.version.trim() ||
    value.version.length > 128 ||
    typeof value.bundleIdentifier !== "string" ||
    value.bundleIdentifier.length > 255 ||
    !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(value.bundleIdentifier) ||
    typeof value.manifestURL !== "string"
  )
    throw new Error("Invalid native release descriptor");
  const origin = privateUpdateOrigin(new URL(value.manifestURL).origin);
  if (
    value.manifestURL !==
    `${origin}/updates/native/${value.buildNumber}/manifest.plist`
  )
    throw new Error("Invalid native release manifest URL");
  return {
    buildNumber: value.buildNumber,
    version: value.version,
    bundleIdentifier: value.bundleIdentifier,
    manifestURL: value.manifestURL,
  };
}

function installManifest(release: NativeRelease): string {
  const ipaURL = release.manifestURL.replace(/manifest\.plist$/, "Orbit.ipa");
  const escape = (text: string) =>
    text.replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&apos;",
        })[character]!,
    );
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>items</key><array><dict>
<key>assets</key><array><dict><key>kind</key><string>software-package</string><key>url</key><string>${escape(ipaURL)}</string></dict></array>
<key>metadata</key><dict><key>bundle-identifier</key><string>${escape(release.bundleIdentifier)}</string><key>bundle-version</key><string>${release.buildNumber}</string><key>kind</key><string>software</string><key>title</key><string>Orbit Lab</string></dict>
</dict></array></dict></plist>\n`;
}

async function openArtifact(filename: string) {
  if ((await fs.realpath(filename)) !== filename)
    throw new Error("Symlinked native update artifact");
  const file = await fs.open(
    filename,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  if (!(await file.stat()).isFile()) {
    await file.close();
    throw new Error("Invalid native update artifact");
  }
  return file;
}

function byteRange(value: string, size: number): [number, number] | undefined {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value);
  if (!match || (!match[1] && !match[2])) return;
  const first = match[1] ? Number(match[1]) : undefined;
  const last = match[2] ? Number(match[2]) : undefined;
  if (
    (first !== undefined && !Number.isSafeInteger(first)) ||
    (last !== undefined && !Number.isSafeInteger(last))
  )
    return;
  const start = first ?? Math.max(0, size - last!);
  const end =
    first === undefined ? size - 1 : Math.min(last ?? size - 1, size - 1);
  if (start >= size || start > end || (first === undefined && last === 0))
    return;
  return [start, end];
}
