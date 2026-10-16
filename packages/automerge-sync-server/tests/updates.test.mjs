import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "node:test";
import {
  maximumUpdateAssetBytes,
  privateUpdateOrigin,
  publishCheckpoint,
  readSelection,
} from "../dist/updates/checkpoint.js";
import { createUpdatesRequestHandler } from "../dist/updates/handler.js";

const directories = [];
const servers = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("iOS checkpoint serves protocol-1 manifest, content keys, integrity hashes and immutable assets", async () => {
  const fixture = await makeFixture();
  const checkpoint = await publishCheckpoint(fixture);
  assert.match(checkpoint.id, /^[0-9a-f-]{36}$/);
  assert.equal(checkpoint.runtimeVersion, "orbit-lab-native-1");
  assert.equal(
    checkpoint.assets[0].key,
    createHash("md5").update(fixture.image).digest("hex"),
  );
  assert.equal(
    checkpoint.assets[0].hash,
    createHash("sha256").update(fixture.image).digest("base64url"),
  );
  assert.equal(checkpoint.assets[0].fileExtension, ".png");
  assert.equal(checkpoint.launchAsset.fileExtension, undefined);
  const response = await fetch(`${fixture.origin}/updates/manifest`, {
    headers: manifestHeaders(),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("expo-protocol-version"), "1");
  assert.equal(response.headers.get("expo-sfv-version"), "0");
  assert.equal(response.headers.get("cache-control"), "private, max-age=0");
  assert.deepEqual(part(await response.text(), "manifest"), checkpoint);
  for (const asset of [...checkpoint.assets, checkpoint.launchAsset]) {
    const download = await fetch(asset.url);
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-type"), asset.contentType);
    assert.match(download.headers.get("cache-control"), /immutable/);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await download.arrayBuffer()))
        .digest("base64url"),
      asset.hash,
    );
  }
});

test("no checkpoint, unknown runtime, and current checkpoint return proper no-update directive", async () => {
  const fixture = await makeFixture();
  let response = await fetch(`${fixture.origin}/updates/manifest`, {
    headers: manifestHeaders(),
  });
  assert.deepEqual(part(await response.text(), "directive"), {
    type: "noUpdateAvailable",
  });
  const checkpoint = await publishCheckpoint(fixture);
  for (const headers of [
    manifestHeaders({ "expo-runtime-version": "incompatible-native-code" }),
    manifestHeaders({ "expo-current-update-id": checkpoint.id }),
  ]) {
    response = await fetch(`${fixture.origin}/updates/manifest`, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(part(await response.text(), "directive"), {
      type: "noUpdateAvailable",
    });
  }
});

test("publication retains previous runtime and old assets for downloads already in flight", async () => {
  const fixture = await makeFixture();
  const first = await publishCheckpoint(fixture);
  const second = await publishCheckpoint({
    ...fixture,
    runtimeVersion: "orbit-lab-native-2",
  });
  const selection = await readSelection(fixture.updatesRoot);
  assert.deepEqual(selection, { current: second.id, previous: first.id });
  let response = await fetch(`${fixture.origin}/updates/manifest`, {
    headers: manifestHeaders(),
  });
  assert.equal(part(await response.text(), "manifest").id, first.id);
  await publishCheckpoint({ ...fixture, runtimeVersion: "orbit-lab-native-2" });
  response = await fetch(first.launchAsset.url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "console.log('checkpoint');");
});

test("incomplete or oversized export cannot replace the current complete checkpoint", async () => {
  const fixture = await makeFixture();
  const checkpoint = await publishCheckpoint(fixture);
  const metadataPath = path.join(fixture.exportDirectory, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.fileMetadata.ios.assets.push({ path: "assets/missing", ext: "png" });
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(publishCheckpoint(fixture), { code: "ENOENT" });
  assert.equal(
    (await readSelection(fixture.updatesRoot)).current,
    checkpoint.id,
  );
  assert.ok(
    !(await fs.readdir(fixture.updatesRoot)).some((entry) =>
      entry.startsWith(".preparing-"),
    ),
  );
  metadata.fileMetadata.ios.assets.pop();
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await fs.truncate(
    path.join(fixture.exportDirectory, metadata.fileMetadata.ios.bundle),
    maximumUpdateAssetBytes + 1,
  );
  await assert.rejects(publishCheckpoint(fixture), /exceeds 256 MB/);
  assert.equal(
    (await readSelection(fixture.updatesRoot)).current,
    checkpoint.id,
  );
});

test("an interrupted streamed asset request does not damage the checkpoint or prevent a later complete fetch", async () => {
  const fixture = await makeFixture();
  const bundlePath = path.join(fixture.exportDirectory, "bundle.hbc");
  await fs.writeFile(bundlePath, Buffer.alloc(8 * 1024 * 1024, 0x61));
  const checkpoint = await publishCheckpoint(fixture);
  await new Promise((resolve, reject) => {
    const request = http.get(checkpoint.launchAsset.url, (response) => {
      response.once("data", () => {
        response.destroy();
        request.destroy();
        resolve();
      });
      response.on("error", () => {});
    });
    request.once("error", reject);
  });
  const response = await fetch(checkpoint.launchAsset.url);
  assert.equal(response.status, 200);
  assert.equal(Number(response.headers.get("content-length")), 8 * 1024 * 1024);
  assert.equal(
    createHash("sha256")
      .update(Buffer.from(await response.arrayBuffer()))
      .digest("base64url"),
    checkpoint.launchAsset.hash,
  );
  assert.equal(
    (await readSelection(fixture.updatesRoot)).current,
    checkpoint.id,
  );
});

test("a checkpoint's directory is durable before its selection can replace the previous update", async () => {
  const fixture = await makeFixture();
  const checkpoint = await publishCheckpoint(fixture);
  const open = fs.open;
  fs.open = async (filename, ...args) => {
    const file = await open(filename, ...args);
    if (path.basename(filename).startsWith(".preparing-")) {
      file.sync = async () => {
        throw new Error("Injected checkpoint directory sync failure");
      };
    }
    return file;
  };
  try {
    await assert.rejects(
      publishCheckpoint(fixture),
      /Injected checkpoint directory sync failure/,
    );
  } finally {
    fs.open = open;
  }
  assert.equal(
    (await readSelection(fixture.updatesRoot)).current,
    checkpoint.id,
  );
  assert.equal((await fetch(checkpoint.launchAsset.url)).status, 200);
  assert.deepEqual(
    (await fs.readdir(fixture.updatesRoot)).sort(),
    [checkpoint.id, "current.json"].sort(),
  );
});

test("path traversal, outside symlinks, query credentials and public origins are rejected", async () => {
  const fixture = await makeFixture();
  const checkpoint = await publishCheckpoint(fixture);
  for (const route of [
    "/updates/assets/%2e%2e/secret",
    "/updates/manifest?token=secret",
    "/updates/assets/../../secret",
  ]) {
    const response = await rawRequest(fixture.origin, route);
    assert.equal(response.status, 400);
    assert.ok(!response.body.includes("secret"));
  }
  const assetFile = path.join(
    fixture.updatesRoot,
    checkpoint.id,
    path.basename(new URL(checkpoint.assets[0].url).pathname),
  );
  await fs.rm(assetFile);
  await fs.symlink(
    path.join(fixture.exportDirectory, "metadata.json"),
    assetFile,
  );
  const response = await fetch(checkpoint.assets[0].url);
  assert.equal(response.status, 503);
  assert.ok(!(await response.text()).includes(fixture.exportDirectory));
  const metadataPath = path.join(fixture.exportDirectory, "metadata.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  metadata.fileMetadata.ios.bundle = "../private-file";
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(
    publishCheckpoint(fixture),
    /Invalid exported asset path/,
  );
  metadata.fileMetadata.ios.bundle = "assets/outside";
  await fs.symlink(
    path.join(fixture.updatesRoot, "current.json"),
    path.join(fixture.exportDirectory, "assets/outside"),
  );
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(publishCheckpoint(fixture), /escapes its directory/);
  for (const origin of [
    "https://withorbit.com",
    "https://token@laptop.tailnet.ts.net",
    "https://laptop.tailnet.ts.net?secret=x",
    "http://laptop.tailnet.ts.net",
    "https://laptop.tailnet.ts.net/updates",
  ]) {
    assert.throws(() => privateUpdateOrigin(origin));
  }
  assert.equal(
    privateUpdateOrigin("https://laptop.tailnet.ts.net"),
    "https://laptop.tailnet.ts.net",
  );
});

test("platform, protocol, runtime, method, representation, and code-signing expectations are explicit", async () => {
  const fixture = await makeFixture();
  for (const [headers, status] of [
    [manifestHeaders({ "expo-platform": "android" }), 400],
    [manifestHeaders({ "expo-protocol-version": "0" }), 400],
    [manifestHeaders({ "expo-runtime-version": "../runtime" }), 400],
    [manifestHeaders({ accept: "application/json" }), 406],
    [manifestHeaders({ accept: "multipart/mixed;q=0" }), 406],
    [manifestHeaders({ "expo-expect-signature": 'sig, keyid="root"' }), 406],
  ]) {
    const response = await fetch(`${fixture.origin}/updates/manifest`, {
      headers,
    });
    assert.equal(response.status, status);
  }
  assert.equal(
    (
      await fetch(`${fixture.origin}/updates/manifest`, {
        method: "POST",
        headers: manifestHeaders(),
      })
    ).status,
    405,
  );
  assert.equal(
    (
      await fetch(`${fixture.origin}/updates/manifest`, {
        headers: manifestHeaders({
          accept: "application/json;q=0.9, multipart/mixed;q=0.8",
        }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(
        `${fixture.origin}/updates/assets/not-a-checkpoint/metadata.json`,
      )
    ).status,
    404,
  );
});

test("checkpoint CLI derives private defaults without embedding the config token and rejects runtime skew before exporting", async () => {
  const fixture = await makeFixture();
  const configPath = path.join(fixture.updatesRoot, "../private-config.json");
  const secret = "private-config-token-never-to-embed";
  await fs.writeFile(
    configPath,
    JSON.stringify({ updatesRoot: fixture.updatesRoot, pairingToken: secret }),
  );
  const script = fileURLToPath(
    new URL("../../app/scripts/lab_checkpoint.ts", import.meta.url),
  );
  const options = {
    env: {
      ...process.env,
      EXPO_PUBLIC_ORBIT_LAB_ORIGIN: fixture.origin,
      EXPO_UPDATES_RUNTIME_VERSION: "cli-test-native",
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  };
  execFileSync(
    "bun",
    [script, "--config", configPath, "--export-dir", fixture.exportDirectory],
    options,
  );
  const selection = await readSelection(fixture.updatesRoot);
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(fixture.updatesRoot, selection.current, "manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.runtimeVersion, "cli-test-native");
  assert.equal(manifest.extra.expoClient.extra.labOrigin, fixture.origin);
  assert.ok(!JSON.stringify(manifest).includes(secret));
  assert.throws(
    () =>
      execFileSync(
        "bun",
        [
          script,
          "--config",
          configPath,
          "--runtime",
          "not-the-native-runtime",
          "--export-dir",
          "missing-export",
        ],
        options,
      ),
    (error) =>
      error.stderr.includes("Checkpoint runtime differs") &&
      !error.stderr.includes(secret),
  );
  assert.deepEqual(await readSelection(fixture.updatesRoot), selection);
});

function manifestHeaders(additions = {}) {
  return {
    "expo-protocol-version": "1",
    "expo-platform": "ios",
    "expo-runtime-version": "orbit-lab-native-1",
    accept: "multipart/mixed",
    ...additions,
  };
}

function part(body, name) {
  assert.ok(body.includes(`name="${name}"`));
  return JSON.parse(body.split("\r\n\r\n")[1].split("\r\n--")[0]);
}

async function makeFixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-updates-test-"),
  );
  directories.push(directory);
  const exportDirectory = path.join(directory, "export");
  const updatesRoot = path.join(directory, "updates");
  await fs.mkdir(path.join(exportDirectory, "assets"), { recursive: true });
  const image = Buffer.from("PNG fixture");
  await fs.writeFile(path.join(exportDirectory, "assets/image"), image);
  await fs.writeFile(
    path.join(exportDirectory, "bundle.hbc"),
    "console.log('checkpoint');",
  );
  await fs.writeFile(
    path.join(exportDirectory, "metadata.json"),
    JSON.stringify({
      version: 0,
      bundler: "metro",
      fileMetadata: {
        ios: {
          bundle: "bundle.hbc",
          assets: [{ path: "assets/image", ext: "png" }],
        },
      },
    }),
  );
  const handle = createUpdatesRequestHandler({ updatesRoot });
  const server = http.createServer((request, response) => {
    void handle(request, response).then((handled) => {
      if (!handled) {
        response.writeHead(404);
        response.end();
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return {
    exportDirectory,
    updatesRoot,
    image,
    origin: `http://127.0.0.1:${server.address().port}`,
    runtimeVersion: "orbit-lab-native-1",
    expoConfig: { name: "Orbit Lab", slug: "orbit" },
  };
}

function rawRequest(origin, route) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    http
      .get(
        { hostname: url.hostname, port: url.port, path: route },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolve({ status: response.statusCode, body }),
          );
        },
      )
      .on("error", reject);
  });
}
