const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { patchSource } = require("./patchRepoSwiftWebSocket.js");

// Remove this source build when upstream publishes an XCFramework containing
// both PR243 and the hexane retained-capacity fix in vendor/automerge/Readme.md.
// Swift 0.7.2's released Rust binary panics on a no-op write followed by sync.
// https://github.com/automerge/automerge-swift/pull/243
const pins = {
  swift: "aa45d17ac92cef2b8ded63b47e65a28dc85e3418", // 0.7.2
  upgrade: "d5b2643636643ce3fcc19c7a8c026ffb0944192e", // merged PR243
  repo: "cdeb8053c3aa2510189429d717ab09e70f134716", // 0.3.2
};
const hexane = {
  version: "1.0.0-alpha.5",
  checksum: "81df830f11babb0eee9a082e09135ef0a7d8791f3fe9b279bb9485bf7eaf23e0",
};
const capacityPatch = path.resolve(
  __dirname,
  "../../../vendor/automerge/hexane-retained-capacity.patch",
);
const corePatches = {
  "rust/Cargo.toml": ['version = "0.7.2"', 'version = "0.12.0"'],
  "rust/src/change.rs": [
    "message: value.message().cloned(),",
    "message: value.message().map(String::from),",
  ],
  "rust/src/doc.rs": [
    "values.into_iter().map(|i| i.into()),",
    "values.into_iter().map(am::ScalarValue::from),",
  ],
};
const remoteFFI =
  'url: "https://github.com/automerge/automerge-swift/releases/download/0.7.2/automergeFFI.xcframework.zip",\n' +
  '        checksum: "10245378e74229b026f689b039d7df3cf17aeed353706d5f420dfd164f283a86"';
const remoteSwift =
  '.package(url: "https://github.com/automerge/automerge-swift", .upToNextMajor(from: "0.5.7"))';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2)
    throw new Error(
      "Upstream Automerge source changed; review/remove the native core patch",
    );
  return source.replace(before, after);
}

function patchSwiftPackage(source) {
  // Do not set LOCAL_BUILD: 0.7.2 also enables unsafe Swift flags under that flag.
  return replaceOnce(source, remoteFFI, 'path: "./automergeFFI.xcframework"');
}

function patchRepoPackage(source) {
  return replaceOnce(
    source,
    remoteSwift,
    '.package(path: "../automerge-swift")',
  );
}

function patchHexaneLock(source) {
  return replaceOnce(
    source,
    `name = "hexane"\nversion = "${hexane.version}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "${hexane.checksum}"`,
    `name = "hexane"\nversion = "${hexane.version}"`,
  );
}

function patchRustManifest(source) {
  if (source.includes("[patch.crates-io]"))
    throw new Error(
      "Review upstream Cargo patches before preparing native Automerge",
    );
  return `${source.trimEnd()}\n\n[patch.crates-io]\nhexane = { path = "hexane" }\n`;
}

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", 2, 2],
    ...options,
  });

function readReady(directory, fingerprint) {
  if (!fs.existsSync(directory)) return false;
  const ready = JSON.parse(
    fs.readFileSync(path.join(directory, "ready.json"), "utf8"),
  );
  if (ready.fingerprint !== fingerprint || !Object.keys(ready.artifacts).length)
    throw new Error("Native Automerge cache has an invalid recipe fingerprint");
  for (const [filename, expected] of Object.entries(ready.artifacts)) {
    if (path.isAbsolute(filename) || filename.split(/[\\/]/).includes(".."))
      throw new Error("Invalid native Automerge artifact path");
    if (digest(fs.readFileSync(path.join(directory, filename))) !== expected)
      throw new Error(
        "Native Automerge artifact changed; inspect its private build cache",
      );
  }
  return true;
}

function filesIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filename) : [filename];
  });
}

function prepareAutomergeNative({
  cacheDirectory = path.join(
    os.homedir(),
    "Library/Caches/Orbit Lab/native/automerge",
  ),
} = {}) {
  if (process.env.LOCAL_BUILD !== undefined)
    throw new Error(
      "Unset LOCAL_BUILD; the Lab uses an explicit local FFI package without unsafe flags",
    );
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("The personal native build requires an Apple Silicon Mac");
  cacheDirectory = path.resolve(cacheDirectory);
  const rustVersion = run("rustc", ["--version"], { stdio: "pipe" }).trim();
  const fingerprint = digest(
    JSON.stringify({
      pins,
      hexane,
      rustVersion,
      capacityPatch: digest(fs.readFileSync(capacityPatch)),
      recipe: digest(fs.readFileSync(__filename)),
      socket: patchSource(
        "let webSocketTask = URLSession.shared.webSocketTask(with: request)",
      ),
    }),
  );
  const prepared = path.join(cacheDirectory, fingerprint);
  if (readReady(prepared, fingerprint))
    return path.join(prepared, "automerge-repo-swift");
  fs.mkdirSync(cacheDirectory, { recursive: true, mode: 0o700 });
  const staging = fs.mkdtempSync(path.join(cacheDirectory, ".preparing-"));
  console.error(
    "Preparing pinned Automerge Swift with upstream Rust core 0.12.0",
  );
  try {
    const swift = path.join(staging, "automerge-swift");
    const repo = path.join(staging, "automerge-repo-swift");
    for (const [name, revision] of [
      ["automerge-swift", pins.swift],
      ["automerge-repo-swift", pins.repo],
    ]) {
      const directory = path.join(staging, name);
      run("git", ["init", "--quiet", directory]);
      run(
        "git",
        [
          "fetch",
          "--quiet",
          "--depth",
          "1",
          `https://github.com/automerge/${name}.git`,
          revision,
        ],
        { cwd: directory },
      );
      run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], {
        cwd: directory,
      });
    }
    run(
      "git",
      [
        "fetch",
        "--quiet",
        "--depth",
        "1",
        "https://github.com/automerge/automerge-swift.git",
        pins.upgrade,
      ],
      { cwd: swift },
    );
    fs.writeFileSync(
      path.join(swift, "rust/Cargo.lock"),
      patchHexaneLock(
        run("git", ["show", `${pins.upgrade}:rust/Cargo.lock`], {
          cwd: swift,
          stdio: "pipe",
        }),
      ),
    );
    const patches = [
      ...Object.entries(corePatches).map(([filename, [before, after]]) => [
        path.join(swift, filename),
        (source) => {
          const patched = replaceOnce(source, before, after);
          return filename === "rust/Cargo.toml"
            ? patchRustManifest(patched)
            : patched;
        },
      ]),
      [path.join(swift, "Package.swift"), patchSwiftPackage],
      [path.join(repo, "Package.swift"), patchRepoPackage],
      [
        path.join(
          repo,
          "Sources/AutomergeRepo/Networking/Providers/WebSocketProvider.swift",
        ),
        patchSource,
      ],
    ];
    for (const [filename, patch] of patches)
      fs.writeFileSync(filename, patch(fs.readFileSync(filename, "utf8")));

    // Keep the registry cache immutable. Only this private, checksum-verified
    // crate copy is patched, using the same source diff as JavaScript/Wasm.
    const archive = path.join(staging, "hexane.crate");
    run("curl", [
      "--fail",
      "--silent",
      "--show-error",
      "--location",
      "--output",
      archive,
      `https://static.crates.io/crates/hexane/hexane-${hexane.version}.crate`,
    ]);
    if (digest(fs.readFileSync(archive)) !== hexane.checksum)
      throw new Error("Native hexane crate checksum mismatch");
    run("tar", ["xf", archive, "-C", staging]);
    const hexaneDirectory = path.join(swift, "rust/hexane");
    fs.renameSync(
      path.join(staging, `hexane-${hexane.version}`),
      hexaneDirectory,
    );
    run("git", ["apply", "-p3", capacityPatch], { cwd: hexaneDirectory });
    fs.rmSync(archive);

    const targets = [
      "aarch64-apple-darwin",
      "aarch64-apple-ios",
      "aarch64-apple-ios-sim",
    ];
    const toolchain = run("rustup", ["show", "active-toolchain"], {
      stdio: "pipe",
    }).split(/\s/)[0];
    run("rustup", ["target", "add", "--toolchain", toolchain, ...targets]);
    const targetDirectory = path.join(staging, "target");
    const env = {
      ...process.env,
      CARGO_HOME: path.join(cacheDirectory, "cargo"),
      CARGO_TARGET_DIR: targetDirectory,
    };
    const framework = path.join(swift, "automergeFFI.xcframework");
    const frameworkArguments = ["-create-xcframework"];
    for (const target of targets) {
      run(
        "cargo",
        [
          "build",
          "--manifest-path",
          path.join(swift, "rust/Cargo.toml"),
          "--lib",
          "--locked",
          "--release",
          "--target",
          target,
        ],
        { env },
      );
      frameworkArguments.push(
        "-library",
        path.join(targetDirectory, target, "release/libuniffi_automerge.a"),
        "-headers",
        path.join(swift, "Sources/_CAutomergeUniffi/include"),
      );
    }
    run("xcodebuild", [...frameworkArguments, "-output", framework]);
    for (const slice of [
      "ios-arm64",
      "ios-arm64-simulator",
      "macos-arm64/Versions/A/Resources",
    ]) {
      fs.mkdirSync(path.join(framework, slice), { recursive: true });
      fs.copyFileSync(
        path.join(swift, "privacy/PrivacyInfo.xcprivacy"),
        path.join(framework, slice, "PrivacyInfo.xcprivacy"),
      );
    }
    const artifacts = Object.fromEntries(
      [
        path.join(swift, "rust/Cargo.lock"),
        ...filesIn(hexaneDirectory),
        ...patches.map(([filename]) => filename),
        ...filesIn(framework),
      ].map((filename) => [
        path.relative(staging, filename),
        digest(fs.readFileSync(filename)),
      ]),
    );
    fs.rmSync(targetDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(staging, "ready.json"),
      JSON.stringify({ fingerprint, pins, rustVersion, artifacts }, null, 2),
    );
    try {
      fs.renameSync(staging, prepared);
    } catch (error) {
      // Concurrent Simulator/device preparation may finish the same recipe first.
      if (
        !["EEXIST", "ENOTEMPTY"].includes(error.code) ||
        !readReady(prepared, fingerprint)
      )
        throw error;
    }
    return path.join(prepared, "automerge-repo-swift");
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--cache-dir"))
    throw new Error("Expected [--cache-dir <private build directory>]");
  console.log(prepareAutomergeNative({ cacheDirectory: args[1] }));
}

module.exports = {
  prepareAutomergeNative,
  pins,
  corePatches,
  hexane,
  replaceOnce,
  patchHexaneLock,
  patchRustManifest,
  patchSwiftPackage,
  patchRepoPackage,
  readReady,
};
