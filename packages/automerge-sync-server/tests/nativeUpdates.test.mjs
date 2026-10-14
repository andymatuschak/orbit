import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  maximumNativeReleaseBytes,
  publishNativeRelease,
} from "../dist/updates/nativeRelease.js";
import { createUpdatesRequestHandler } from "../dist/updates/handler.js";

const fixtures = [];
afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async ({ server, directory }) => {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(directory, { recursive: true, force: true });
    }),
  );
});

test("native descriptor and installation artifacts are independent of Expo runtime", async () => {
  const fixture = await makeFixture();
  const release = await publishNativeRelease(fixture);
  assert.deepEqual(release, {
    buildNumber: "70",
    version: "1.0",
    bundleIdentifier: "com.withorbit.native",
    manifestURL: `${fixture.origin}/updates/native/70/manifest.plist`,
  });
  const descriptor = await fetch(`${fixture.origin}/updates/native.json`, {
    headers: { "expo-runtime-version": "an-old-native-runtime" },
  });
  assert.equal(descriptor.status, 200);
  assert.equal(descriptor.headers.get("cache-control"), "no-store");
  assert.equal(descriptor.headers.get("content-type"), "application/json");
  assert.deepEqual(await descriptor.json(), release);
  const manifest = await fetch(release.manifestURL);
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get("content-type"), /^text\/xml/);
  assert.match(manifest.headers.get("cache-control"), /immutable/);
  const plist = await manifest.text();
  assert.ok(
    plist.includes(
      `<string>${fixture.origin}/updates/native/70/Orbit.ipa</string>`,
    ),
  );
  assert.ok(plist.includes("<key>bundle-version</key><string>70</string>"));
  assert.ok(plist.includes("<string>com.withorbit.native</string>"));
  assert.ok(plist.includes("<string>Orbit Lab</string>"));
  const ipa = await fetch(
    release.manifestURL.replace("manifest.plist", "Orbit.ipa"),
  );
  assert.equal(ipa.headers.get("content-type"), "application/octet-stream");
  assert.equal(Number(ipa.headers.get("content-length")), fixture.bytes.length);
  assert.deepEqual(Buffer.from(await ipa.arrayBuffer()), fixture.bytes);
});

test("no native release returns 404 without requiring an Expo manifest", async () => {
  const fixture = await makeFixture();
  const response = await fetch(`${fixture.origin}/updates/native.json`);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(
    await fs.stat(fixture.updatesRoot).catch(() => undefined),
    undefined,
  );
});

test("publishing retains older builds and refuses replacing immutable build artifacts", async () => {
  const fixture = await makeFixture();
  const first = await publishNativeRelease(fixture);
  await fs.writeFile(fixture.ipaPath, "second IPA");
  await publishNativeRelease({ ...fixture, buildNumber: "71" });
  await assert.rejects(publishNativeRelease(fixture), /already published/);
  assert.equal(
    (await (await fetch(`${fixture.origin}/updates/native.json`)).json())
      .buildNumber,
    "71",
  );
  assert.deepEqual(
    Buffer.from(
      await (
        await fetch(first.manifestURL.replace("manifest.plist", "Orbit.ipa"))
      ).arrayBuffer(),
    ),
    fixture.bytes,
  );
  assert.equal(
    await (await fetch(`${fixture.origin}/updates/native/71/Orbit.ipa`)).text(),
    "second IPA",
  );
});

test("failed publication leaves the previous complete descriptor and no preparing artifacts", async () => {
  const fixture = await makeFixture();
  const previous = await publishNativeRelease(fixture);
  const file = await fs.open(fixture.ipaPath, "w");
  await file.truncate(maximumNativeReleaseBytes + 1);
  await file.close();
  await assert.rejects(
    publishNativeRelease({ ...fixture, buildNumber: "71" }),
    /no larger than 1 GiB/,
  );
  assert.deepEqual(
    await (await fetch(`${fixture.origin}/updates/native.json`)).json(),
    previous,
  );
  assert.deepEqual(await fs.readdir(path.join(fixture.updatesRoot, "native")), [
    "70",
  ]);
  // Inject a rename failure after the complete copy: no incomplete release or
  // descriptor may escape the staging directory.
  await fs.writeFile(fixture.ipaPath, fixture.bytes);
  const rename = fs.rename;
  const target = path.join(
    await fs.realpath(fixture.updatesRoot),
    "native",
    "71",
  );
  fs.rename = async (source, destination) => {
    if (destination === target)
      throw Object.assign(new Error("Injected publication failure"), {
        code: "EIO",
      });
    return rename(source, destination);
  };
  try {
    await assert.rejects(
      publishNativeRelease({ ...fixture, buildNumber: "71" }),
      /Injected publication failure/,
    );
  } finally {
    fs.rename = rename;
  }
  assert.deepEqual(
    await (await fetch(`${fixture.origin}/updates/native.json`)).json(),
    previous,
  );
  assert.ok(
    !(await fs.readdir(fixture.updatesRoot)).some((item) =>
      item.startsWith(".native-"),
    ),
  );
  assert.deepEqual(await fs.readdir(path.join(fixture.updatesRoot, "native")), [
    "70",
  ]);
});

test("native artifacts support HEAD and single byte range downloads", async () => {
  const fixture = await makeFixture();
  await publishNativeRelease(fixture);
  const url = `${fixture.origin}/updates/native/70/Orbit.ipa`;
  for (const route of [
    "/updates/native.json",
    "/updates/native/70/manifest.plist",
    "/updates/native/70/Orbit.ipa",
  ]) {
    const response = await fetch(`${fixture.origin}${route}`, {
      method: "HEAD",
    });
    assert.equal(response.status, 200);
    assert.ok(Number(response.headers.get("content-length")) > 0);
    assert.equal(await response.text(), "");
  }
  for (const [range, start, end] of [
    ["bytes=1-3", 1, 3],
    ["bytes=4-", 4, fixture.bytes.length - 1],
    ["bytes=-3", fixture.bytes.length - 3, fixture.bytes.length - 1],
    ["bytes=2-9999", 2, fixture.bytes.length - 1],
  ]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 206);
    assert.equal(
      response.headers.get("content-range"),
      `bytes ${start}-${end}/${fixture.bytes.length}`,
    );
    assert.equal(
      Number(response.headers.get("content-length")),
      end - start + 1,
    );
    assert.deepEqual(
      Buffer.from(await response.arrayBuffer()),
      fixture.bytes.subarray(start, end + 1),
    );
  }
  for (const range of [
    "bytes=9999-",
    "bytes=4-1",
    "bytes=-0",
    "bytes=-",
    "bytes=0-1,4-5",
    "bytes=9007199254740992-",
    "nonsense",
  ]) {
    const response = await fetch(url, { headers: { Range: range } });
    assert.equal(response.status, 416, range);
    assert.equal(
      response.headers.get("content-range"),
      `bytes */${fixture.bytes.length}`,
    );
    assert.equal(await response.text(), "");
  }
  const head = await fetch(url, {
    method: "HEAD",
    headers: { Range: "bytes=1-3" },
  });
  assert.equal(head.status, 200);
  assert.equal(
    Number(head.headers.get("content-length")),
    fixture.bytes.length,
  );
  const post = await fetch(url, { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("invalid release metadata, public origins, traversal and symlinks are rejected", async () => {
  const fixture = await makeFixture();
  for (const buildNumber of [
    "0",
    "-1",
    "1.0",
    "01",
    "1/2",
    "1e2",
    "9007199254740992",
    70,
  ])
    await assert.rejects(publishNativeRelease({ ...fixture, buildNumber }));
  for (const origin of [
    "https://example.com",
    "https://laptop.ts.net/updates",
    "https://token@laptop.ts.net",
  ])
    await assert.rejects(publishNativeRelease({ ...fixture, origin }));
  await assert.rejects(
    publishNativeRelease({ ...fixture, bundleIdentifier: "bad/path" }),
  );
  await assert.rejects(publishNativeRelease({ ...fixture, version: "" }));
  await publishNativeRelease(fixture);
  for (const route of [
    "/updates/native/../native.json",
    "/updates/native/%2e%2e/native.json",
    "/updates/native.json?token=secret",
  ])
    assert.equal(await rawStatus(fixture.origin, route), 400);
  for (const route of [
    "/updates/native/070/Orbit.ipa",
    "/updates/native/70/other.ipa",
    "/updates/native/70/Orbit.ipa/extra",
  ])
    assert.equal((await fetch(`${fixture.origin}${route}`)).status, 404);
  const ipa = path.join(fixture.updatesRoot, "native", "70", "Orbit.ipa");
  await fs.unlink(ipa);
  await fs.symlink(fixture.ipaPath, ipa);
  assert.equal(
    (await fetch(`${fixture.origin}/updates/native/70/Orbit.ipa`)).status,
    503,
  );
  await fs.unlink(path.join(fixture.updatesRoot, "native.json"));
  await fs.symlink(
    fixture.ipaPath,
    path.join(fixture.updatesRoot, "native.json"),
  );
  assert.equal(
    (await fetch(`${fixture.origin}/updates/native.json`)).status,
    503,
  );
  const sourceLink = path.join(fixture.directory, "linked.ipa");
  await fs.symlink(fixture.ipaPath, sourceLink);
  await assert.rejects(
    publishNativeRelease({
      ...fixture,
      ipaPath: sourceLink,
      buildNumber: "71",
    }),
  );
});

async function makeFixture() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-native-updates-test-"),
  );
  const updatesRoot = path.join(directory, "updates");
  const ipaPath = path.join(directory, "fixture.ipa");
  const bytes = Buffer.from("signed IPA fixture");
  await fs.writeFile(ipaPath, bytes);
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
  const fixture = {
    server,
    directory,
    updatesRoot,
    ipaPath,
    bytes,
    origin: `http://127.0.0.1:${server.address().port}`,
    buildNumber: "70",
    version: "1.0",
    bundleIdentifier: "com.withorbit.native",
  };
  fixtures.push(fixture);
  return fixture;
}

function rawStatus(origin, route) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    http
      .get(
        { hostname: url.hostname, port: url.port, path: route },
        (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        },
      )
      .on("error", reject);
  });
}
