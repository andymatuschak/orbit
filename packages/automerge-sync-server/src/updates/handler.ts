import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  isMissingFile,
  readSelection,
  runtimeVersionPattern,
  type UpdateManifest,
} from "./checkpoint.js";
import { nativeUpdateResponse } from "./nativeRelease.js";

// Expo owns persistence, integrity checks, runtime compatibility and fallback.
// This private iOS-only adapter implements protocol 1, not EAS channels or auth.
// Serve it only behind loopback/Tailscale; it distributes executable code.
// https://docs.expo.dev/technical-specs/expo-updates-1/
export function createUpdatesRequestHandler({
  updatesRoot,
}: {
  updatesRoot: string;
}) {
  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<boolean> => {
    const route = request.url ?? "/";
    if (!route.startsWith("/updates/")) return false;
    if (route.includes("?") || route.includes("%") || route.includes("..")) {
      reply(response, 400, "Invalid update path");
      return true;
    }
    const native =
      route === "/updates/native.json" || route.startsWith("/updates/native/");
    if (request.method !== "GET" && !(native && request.method === "HEAD")) {
      response.setHeader("Allow", native ? "GET, HEAD" : "GET");
      reply(response, 405, native ? "Expected GET or HEAD" : "Expected GET");
      return true;
    }
    try {
      const directory = await fs.realpath(updatesRoot).catch((error) => {
        if (isMissingFile(error)) return path.resolve(updatesRoot);
        throw error;
      });
      if (native) {
        await nativeUpdateResponse(request, response, directory, route);
      } else if (route === "/updates/manifest") {
        await manifestResponse(request, response, directory);
      } else {
        const match =
          /^\/updates\/assets\/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\/([0-9a-f]{64}\.[a-z0-9]+)$/.exec(
            route,
          );
        if (!match) reply(response, 404, "Unknown update path");
        else {
          const checkpoint = await loadManifest(directory, match[1]);
          const asset = [checkpoint.launchAsset, ...checkpoint.assets].find(
            (item) => new URL(item.url).pathname === route,
          );
          if (!asset) reply(response, 404, "Unknown update asset");
          else {
            const assetPath = path.join(directory, match[1], match[2]);
            const actualPath = await fs.realpath(assetPath);
            if (actualPath !== path.resolve(assetPath))
              throw new Error("Symlinked update asset");
            const file = await fs.open(actualPath, "r");
            try {
              response.writeHead(200, {
                "Content-Type": asset.contentType,
                "Content-Length": (await file.stat()).size,
                "Cache-Control": "private, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
              });
              await pipeline(
                file.createReadStream({ autoClose: false }),
                response,
              );
            } finally {
              await file.close();
            }
          }
        }
      }
    } catch (error) {
      // Never return local paths, raw configuration or an internal exception.
      if (response.headersSent) response.destroy();
      else
        reply(
          response,
          isMissingFile(error) && route !== "/updates/manifest" ? 404 : 503,
          "Update unavailable",
        );
    }
    return true;
  };
}

async function manifestResponse(
  request: IncomingMessage,
  response: ServerResponse,
  updatesRoot: string,
) {
  if (
    request.headers["expo-protocol-version"] !== "1" ||
    request.headers["expo-platform"] !== "ios"
  ) {
    reply(response, 400, "Expected Expo protocol 1 on iOS");
    return;
  }
  const runtime = request.headers["expo-runtime-version"];
  if (typeof runtime !== "string" || !runtimeVersionPattern.test(runtime)) {
    reply(response, 400, "Expected native runtime version");
    return;
  }
  const accept = request.headers.accept ?? "";
  if (
    !accept
      .split(",")
      .some(
        (type) =>
          /^\s*multipart\/mixed(?:\s*;|\s*$)/.test(type) &&
          !/;\s*q=0(?:\.0*)?\s*(?:;|$)/.test(type),
      )
  ) {
    reply(response, 406, "Expected multipart/mixed");
    return;
  }
  if (request.headers["expo-expect-signature"]) {
    reply(response, 406, "Code signing is not configured");
    return;
  }
  const selection = await readSelection(updatesRoot);
  let manifest: UpdateManifest | undefined;
  for (const id of [selection?.current, selection?.previous]) {
    if (!id) continue;
    const candidate = await loadManifest(updatesRoot, id);
    if (candidate.runtimeVersion === runtime) {
      manifest = candidate;
      break;
    }
  }
  const currentID = request.headers["expo-current-update-id"];
  const part =
    !manifest ||
    (typeof currentID === "string" && currentID.toLowerCase() === manifest.id)
      ? "directive"
      : "manifest";
  const body =
    part === "manifest"
      ? JSON.stringify(manifest)
      : '{"type":"noUpdateAvailable"}';
  const boundary = `orbit-${randomUUID()}`;
  response.writeHead(200, {
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
    "expo-manifest-filters": "",
    "expo-server-defined-headers": "",
    "Cache-Control": "private, max-age=0",
    "Content-Type": `multipart/mixed; boundary=${boundary}`,
    Vary: "expo-runtime-version, expo-platform, expo-current-update-id, accept",
  });
  response.end(
    `--${boundary}\r\nContent-Disposition: form-data; name="${part}"\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--\r\n`,
  );
}

async function loadManifest(
  updatesRoot: string,
  id: string,
): Promise<UpdateManifest> {
  const manifest: UpdateManifest = JSON.parse(
    await fs.readFile(path.join(updatesRoot, id, "manifest.json"), "utf8"),
  );
  if (
    manifest.id !== id ||
    typeof manifest.runtimeVersion !== "string" ||
    !runtimeVersionPattern.test(manifest.runtimeVersion) ||
    !Number.isFinite(Date.parse(manifest.createdAt)) ||
    !Array.isArray(manifest.assets) ||
    !manifest.launchAsset?.url
  ) {
    throw new Error("Invalid checkpoint manifest");
  }
  return manifest;
}

function reply(response: ServerResponse, status: number, error: string): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify({ error }));
}
