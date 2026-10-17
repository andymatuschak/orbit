// Rebuild the upstream package with one Rust allocation fix; no Orbit runtime code.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = "8d7b12f8da553afbb325e37a6c66942b8dd4d994";
const nightly = "nightly-2026-10-15";
const patch = path.join(here, "hexane-retained-capacity.patch");
const hash = (file) =>
  createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "automerge-raw-capacity-"));
console.log(`Build inputs and intermediates: ${work}`);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0)
    throw result.error ?? new Error(`${command} exited ${result.status}`);
  return result.stdout?.trim();
}
const checkout = path.join(work, "automerge");
run("git", ["init", "--quiet", checkout]);
run(
  "git",
  [
    "fetch",
    "--quiet",
    "--depth=1",
    "https://github.com/automerge/automerge.git",
    source,
  ],
  { cwd: checkout },
);
run("git", ["checkout", "--quiet", "--detach", "FETCH_HEAD"], {
  cwd: checkout,
});
run("git", ["apply", "--check", patch], { cwd: checkout });
run("git", ["apply", patch], { cwd: checkout });
fs.copyFileSync(
  path.join(here, "Cargo.lock"),
  path.join(checkout, "rust/Cargo.lock"),
);

run("rustup", [
  "toolchain",
  "install",
  nightly,
  "--profile=minimal",
  "--component=rust-src",
  "--target=wasm32-unknown-unknown",
]);
const cargo = run("rustup", ["which", "--toolchain", nightly, "cargo"], {
  stdio: ["ignore", "pipe", "inherit"],
  encoding: "utf8",
});
const tools = path.join(work, "tools");
const env = {
  ...process.env,
  PATH: `${path.dirname(cargo)}${path.delimiter}${process.env.PATH}`,
};
run(
  cargo,
  [
    "install",
    "wasm-bindgen-cli",
    "--version=0.2.126",
    "--locked",
    "--root",
    tools,
  ],
  { env },
);
run("npm", [
  "install",
  "--prefix",
  tools,
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  "esbuild@0.28.0",
]);
run("npm", [
  "pack",
  "@automerge/automerge@3.4.1",
  "--silent",
  "--pack-destination",
  work,
]);
const archive = path.join(work, "automerge-automerge-3.4.1.tgz");
assert.equal(
  hash(archive),
  "6814e6559f46462f5a11a66f9e42b00eaa558eefdcb901b6bcd1b220a8227cd1",
);
const official = path.join(work, "official");
fs.mkdirSync(official);
run("tar", ["-xzf", archive, "-C", official]);
const js = path.join(checkout, "javascript");
// Reuse the published JavaScript/declarations verbatim. Only generated Wasm
// bindings and bundles change; the upstream TypeScript API is not recompiled.
fs.cpSync(path.join(official, "package/dist"), path.join(js, "dist"), {
  recursive: true,
});
fs.symlinkSync(
  path.join(tools, "node_modules"),
  path.join(js, "node_modules"),
  "dir",
);
const buildEnv = {
  ...env,
  PATH: `${path.join(tools, "bin")}${path.delimiter}${env.PATH}`,
  WASM_CARGO: "cargo",
  RUSTFLAGS: `--remap-path-prefix=${checkout}=/automerge`,
};
const upstreamBuild = path.join(js, "scripts/build.mjs");
run(process.execPath, [upstreamBuild, "--step", "build-wasm"], {
  env: buildEnv,
});
assert.equal(
  hash(path.join(checkout, "rust/Cargo.lock")),
  hash(path.join(here, "Cargo.lock")),
);
fs.cpSync(
  path.join(js, "src/wasm_bindgen_output"),
  path.join(js, "dist/mjs/wasm_bindgen_output"),
  { recursive: true },
);
run(process.execPath, [upstreamBuild, "--step", "transpile-cjs"], {
  env: buildEnv,
});
const metadata = JSON.parse(
  fs.readFileSync(path.join(official, "package/package.json"), "utf8"),
);
metadata.version = "3.4.1-orbit.1";
metadata.orbitPatch = {
  source,
  nightly,
  wasmBindgen: "0.2.126",
  patchSHA256: hash(patch),
  cargoLockSHA256: hash(path.join(here, "Cargo.lock")),
};
fs.writeFileSync(
  path.join(js, "package.json"),
  JSON.stringify(metadata, null, 2) + "\n",
);
run(
  "npm",
  ["pack", "--ignore-scripts", "--silent", "--pack-destination", here],
  { cwd: js },
);
const result = path.join(here, "automerge-automerge-3.4.1-orbit.1.tgz");
console.log(
  JSON.stringify(
    { file: result, bytes: fs.statSync(result).size, sha256: hash(result) },
    null,
    2,
  ),
);
