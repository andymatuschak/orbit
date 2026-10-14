import { execFileSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadLabConfiguration } from "../../automerge-sync-server/src/config.ts";
import { publishNativeRelease } from "../../automerge-sync-server/src/updates/nativeRelease.ts";

// Publish the exported artifact's actual identity, not the checkout's current
// Expo config: the installed app must compare against CFBundleVersion.
const { values } = parseArgs({
  options: {
    ipa: { type: "string" },
    device: { type: "string" },
    config: { type: "string" },
  },
});
if (!values.ipa || !values.device) {
  throw new Error(
    "Expected --ipa <ad-hoc-signed.ipa> --device <registered-UDID>",
  );
}
const ipaPath = path.resolve(values.ipa);
function entry(name: string): Buffer {
  return execFileSync("/usr/bin/unzip", ["-p", ipaPath, name], {
    maxBuffer: 4 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
function field(plist: Buffer, key: string): string {
  return execFileSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", "-o", "-", "-"],
    { input: plist, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}
const info = entry("Payload/Orbit.app/Info.plist");
const expo = entry("Payload/Orbit.app/Expo.plist");
const profiles = execFileSync("/usr/bin/unzip", ["-Z", "-1", ipaPath], {
  encoding: "utf8",
})
  .split("\n")
  .filter((name) =>
    /^Payload\/Orbit\.app\/(?:PlugIns\/[^/]+\.appex\/)?embedded\.mobileprovision$/.test(
      name,
    ),
  );
if (!profiles.includes("Payload/Orbit.app/embedded.mobileprovision")) {
  throw new Error("Missing ad-hoc provisioning profile");
}
for (const name of profiles) {
  const profile = execFileSync(
    "/usr/bin/security",
    ["cms", "-D", "-i", "/dev/stdin"],
    {
      input: entry(name),
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const devices: unknown = JSON.parse(
    execFileSync(
      "/usr/bin/plutil",
      ["-extract", "ProvisionedDevices", "json", "-o", "-", "-"],
      { input: profile, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ),
  );
  const expiry = new Date(field(profile, "ExpirationDate")).getTime();
  if (
    field(profile, "Entitlements.get-task-allow") !== "false" ||
    !Array.isArray(devices) ||
    !devices.includes(values.device) ||
    !Number.isFinite(expiry) ||
    expiry <= Date.now()
  ) {
    throw new Error(
      "App and extensions must have unexpired ad-hoc profiles including the requested device",
    );
  }
}
const bundleIdentifier = field(info, "CFBundleIdentifier");
if (bundleIdentifier !== "com.withorbit.native") {
  throw new Error("Refusing to publish a different app identity");
}
const origin = new URL(field(expo, "EXUpdatesURL"));
if (origin.protocol !== "https:" || !origin.hostname.endsWith(".ts.net")) {
  throw new Error(
    "Native installation requires the private Tailscale HTTPS origin",
  );
}
const config = await loadLabConfiguration(
  values.config ?? process.env.ORBIT_LAB_CONFIG,
);
const release = await publishNativeRelease({
  ipaPath,
  updatesRoot: config.updatesRoot,
  origin: origin.origin,
  buildNumber: field(info, "CFBundleVersion"),
  version: field(info, "CFBundleShortVersionString"),
  bundleIdentifier,
});
console.log(
  `Published native build ${release.buildNumber}: ${release.manifestURL}`,
);
