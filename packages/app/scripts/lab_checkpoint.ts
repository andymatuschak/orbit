import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  publishCheckpoint,
  privateUpdateOrigin,
} from "../../automerge-sync-server/src/updates/checkpoint.ts";

// Run with Bun from any directory. No secrets, EAS hosting, or public defaults.
const { values } = parseArgs({
  options: {
    config: { type: "string" },
    origin: { type: "string" },
    runtime: { type: "string" },
    "updates-root": { type: "string" },
    "export-dir": { type: "string" },
  },
});
const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const expoCLI = path.join(appRoot, "../../node_modules/expo/bin/cli");
// The checkpoint's server URLs and the bundle's pairing default must agree.
const environment = {
  ...process.env,
  ...(values.origin && {
    EXPO_PUBLIC_ORBIT_LAB_ORIGIN: privateUpdateOrigin(values.origin),
  }),
  CI: "1",
};
const started = performance.now();
// Resolve once before exporting: a wrong runtime must not waste a bundle build.
const expoConfig = JSON.parse(
  execFileSync(
    process.execPath,
    [expoCLI, "config", "--type", "public", "--json"],
    {
      cwd: appRoot,
      env: environment,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
    },
  ),
);
const origin = privateUpdateOrigin(new URL(expoConfig.updates.url).origin);
const runtime = values.runtime ?? expoConfig.runtimeVersion;
if (typeof runtime !== "string" || runtime !== expoConfig.runtimeVersion) {
  throw new Error(
    "Checkpoint runtime differs from the app's configured native runtime",
  );
}
let updatesRoot = values["updates-root"];
if (!updatesRoot) {
  const configPath = path.resolve(
    values.config ??
      process.env.ORBIT_LAB_CONFIG ??
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Orbit Lab",
        "config.json",
      ),
  );
  // Only the artifact directory is read from private config. Pairing keys and
  // vault configuration never become Expo environment variables or bundle data.
  try {
    const configuration = JSON.parse(await fs.readFile(configPath, "utf8"));
    updatesRoot =
      configuration.updatesRoot ??
      path.join(path.dirname(configPath), "updates");
  } catch {
    throw new Error(
      "Configure Orbit Lab before publishing a checkpoint, or pass --updates-root for an isolated export",
    );
  }
}
if (typeof updatesRoot !== "string" || !path.isAbsolute(updatesRoot)) {
  throw new Error("The Lab updates directory must be an absolute path");
}
const temporary = values["export-dir"]
  ? undefined
  : await fs.mkdtemp(path.join(os.tmpdir(), "orbit-lab-export-"));
try {
  const exportDirectory = path.resolve(values["export-dir"] ?? temporary!);
  if (!values["export-dir"]) {
    execFileSync(
      process.execPath,
      [expoCLI, "export", "--platform", "ios", "--output-dir", exportDirectory],
      {
        cwd: appRoot,
        env: environment,
        stdio: "inherit",
      },
    );
  }
  const manifest = await publishCheckpoint({
    exportDirectory,
    updatesRoot,
    origin,
    runtimeVersion: runtime,
    expoConfig,
  });
  console.log(
    `Published iOS checkpoint ${manifest.id}; runtime ${manifest.runtimeVersion}; ${manifest.assets.length} assets; ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
} finally {
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
}
