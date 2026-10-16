const { expect, test } = require("bun:test");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  pins,
  corePatches,
  replaceOnce,
  patchSwiftPackage,
  patchRepoPackage,
  readReady,
} = require("./prepareAutomergeNative.js");

test("the native repair pins official source commits without moving the UniFFI API", () => {
  for (const pin of Object.values(pins)) expect(pin).toMatch(/^[a-f0-9]{40}$/);
  expect(Object.keys(corePatches)).toEqual([
    "rust/Cargo.toml",
    "rust/src/change.rs",
    "rust/src/doc.rs",
  ]);
  for (const [before, after] of Object.values(corePatches)) {
    expect(replaceOnce(`prefix\n${before}\nsuffix`, before, after)).toBe(
      `prefix\n${after}\nsuffix`,
    );
    expect(() => replaceOnce("changed upstream", before, after)).toThrow(
      "Upstream Automerge source changed",
    );
    expect(() => replaceOnce(`${before}\n${before}`, before, after)).toThrow(
      "Upstream Automerge source changed",
    );
  }
});

test("the explicit local FFI avoids LOCAL_BUILD unsafe flags and a stale remote binary", () => {
  const source = `if ProcessInfo.processInfo.environment["LOCAL_BUILD"] != nil {
    globalSwiftSettings.append(.unsafeFlags(["-strict-concurrency=complete"]))
}
let target = .binaryTarget(
        name: "automergeFFI",
        url: "https://github.com/automerge/automerge-swift/releases/download/0.7.2/automergeFFI.xcframework.zip",
        checksum: "10245378e74229b026f689b039d7df3cf17aeed353706d5f420dfd164f283a86"
    )`;
  const patched = patchSwiftPackage(source);
  expect(patched).toContain('path: "./automergeFFI.xcframework"');
  expect(patched).not.toContain("releases/download");
  expect(patched.split("let target")[0]).toBe(source.split("let target")[0]);
  expect(() => patchSwiftPackage(source.replace("0.7.2", "0.7.3"))).toThrow(
    "Upstream Automerge source changed",
  );
  expect(() => patchSwiftPackage(source + source)).toThrow(
    "Upstream Automerge source changed",
  );
});

test("Repo Swift resolves the prepared sibling package instead of an SPM binary-cache patch", () => {
  const source =
    '.package(url: "https://github.com/automerge/automerge-swift", .upToNextMajor(from: "0.5.7"))';
  expect(patchRepoPackage(source)).toBe('.package(path: "../automerge-swift")');
  expect(() => patchRepoPackage(source.replace("0.5.7", "0.8.0"))).toThrow(
    "Upstream Automerge source changed",
  );
});

test("only a complete recipe with unchanged artifacts is reused", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "orbit-native-prep-test-"),
  );
  try {
    expect(readReady(path.join(directory, "absent"), "recipe")).toBe(false);
    expect(() => readReady(directory, "recipe")).toThrow();
    fs.writeFileSync(path.join(directory, "library.a"), "compiled fixture");
    const ready = {
      fingerprint: "recipe",
      artifacts: {
        "library.a": createHash("sha256")
          .update("compiled fixture")
          .digest("hex"),
      },
    };
    fs.writeFileSync(path.join(directory, "ready.json"), JSON.stringify(ready));
    expect(readReady(directory, "recipe")).toBe(true);
    expect(() => readReady(directory, "another recipe")).toThrow(
      "recipe fingerprint",
    );
    fs.writeFileSync(path.join(directory, "library.a"), "changed fixture");
    expect(() => readReady(directory, "recipe")).toThrow("artifact changed");
    fs.writeFileSync(
      path.join(directory, "ready.json"),
      JSON.stringify({ fingerprint: "recipe", artifacts: {} }),
    );
    expect(() => readReady(directory, "recipe")).toThrow("recipe fingerprint");
    fs.writeFileSync(
      path.join(directory, "ready.json"),
      JSON.stringify({
        fingerprint: "recipe",
        artifacts: { "../outside": "hash" },
      }),
    );
    expect(() => readReady(directory, "recipe")).toThrow("artifact path");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
