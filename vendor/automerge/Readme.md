# Temporary upstream raw-slab allocation fix

This is Automerge **3.4.1**, with its existing JavaScript API and exports, plus
one Rust allocation fix. It is not an Orbit storage format or recovery path.
The root dependency override makes the server, browser, and importer use the
same checked-in npm tarball. Normal installs do not build Rust.

## Cause and patch

`RawColumn::load` puts a decoded byte column in one large slab. Splitting that
slab calls `Vec::split_off` and truncates the left side, but truncation retains
its original allocation. Repeated inserts can leave many small slabs each
holding a nearly original-sized allocation: quadratic memory growth despite
small stored data. Both local updates and incoming changes can trigger it.

`hexane-retained-capacity.patch` releases excess left-side capacity after the
split, retaining the normal slab budget. It changes no bytes, CRDT operations,
history, heads, or document IDs. Its small Rust regression reproduces the
problem without exhausting memory: 262 KB of data retained 25.2 MB before the
fix; the test bounds capacity to three times data length. All 36 raw-column
tests, including the existing splice/copy fuzz tests, pass with the fix. The full
hexane suite passes too: 636 passed, 15 existing ignored, no failures.

The motivating private catalog had one snapshot and 42 incremental chunks,
3.24 MB total. Unmodified Automerge trapped while loading their concatenation;
chunkwise loading succeeded. Instrumented native loading stopped the original
at 538 MB retained raw capacity for 4.85 MB data. With the patch, concatenated
loading peaked below 10 MB raw capacity and preserved all 10,892 entries, 3,777
changes, heads, and complete history. These private fixtures are not committed.

The bug also reproduces in published JS 3.5.0/Rust 0.12.0. Updating versions alone
does not fix it. The existing native `prepareAutomergeNative.js` recipe applies
this same patch to checksum-verified hexane 1.0.0-alpha.5 and includes its hash
in the native cache fingerprint. Already installed phone binaries do not change
when a JavaScript update or server dependency is installed.

## Public reproduction and checks

```sh
node --wasm-max-mem-pages=4096 vendor/automerge/regression.mjs
bun vendor/automerge/regression.mjs
```

The test creates only generated strings in an isolated, network-free Repo:
1,000 entries with 8 KB values, then 1,000 small updates. It flushes a snapshot
and incremental changes, serializes the test adapter, and starts a fresh process
using ordinary Repo loading. Every value, head, and change hash must match.
Node's 256 MB Wasm limit makes the unpatched reproduction fail safely rather
than exhaust host RAM. Run the Bun variant only against the patched package.

## Rebuild

```sh
node vendor/automerge/build.mjs
```

Requires Node, npm, Git, and rustup. The script uses a temporary directory,
installs the explicitly dated nightly without changing the default toolchain,
and leaves inputs/intermediates available for inspection. Inputs are pinned:

- [Automerge 3.4.1 source](https://github.com/automerge/automerge/tree/8d7b12f8da553afbb325e37a6c66942b8dd4d994),
  Rust 0.11.0 / hexane 1.0.0-alpha.5.
- The official 3.4.1 npm tarball, SHA-256 verified in `build.mjs`. Its published
  JavaScript API files and declarations are reused, not rewritten.
- Checked-in `Cargo.lock`, Rust `nightly-2026-10-15`, wasm-bindgen 0.2.126,
  and esbuild 0.28.0. The Rust build retains upstream's panic-unwind and legacy
  Wasm exception-handling flags. Upstream generates all supported bindings.

The generated package identifies itself as `3.4.1-orbit.1`; its `orbitPatch`
metadata records the source, toolchain, patch hash, and Cargo lock hash. The
build prints the artifact's byte size and SHA-256. No npm publication, GitHub
posting, or application/server deployment is part of this script.

Remove this directory, the override, and the native source patch together once
an upstream JS release **and** the native Rust dependency contain the fix and
pass the public bounded-memory regression plus the preserved large catalog
fresh-process Node/Bun Repo cold-open gates. A storage compaction alone is not
that removal condition.
