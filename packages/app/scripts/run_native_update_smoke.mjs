// Real Release Simulator UI against a disposable Lab, never a phone/live vault.
// Simulator cannot install ad-hoc IPAs; record whether its URL stub rejects or
// accepts the handoff. Neither behavior verifies a physical installation.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { openSync, closeSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";

if (process.argv.includes("--help")) {
  console.log("Set ORBIT_SIMULATOR_UDID to a dedicated, booted Simulator with the current Release app installed.");
  console.log("Build it with EXPO_PUBLIC_ORBIT_LAB_ORIGIN=https://slab.tail0da701.ts.net:9443; updates must be enabled.");
  console.log("Requires Node, AXe, built server, Tailscale, and free ports 8788/9443. Never builds or installs.");
  console.log("Temporarily adds Serve 9443→8788; preserves other routes and restores the previous Lab selection.");
  process.exit(0);
}
const udid = process.env.ORBIT_SIMULATOR_UDID;
assert.match(udid ?? "", /^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/, "Set an explicit dedicated ORBIT_SIMULATOR_UDID");
const origin = process.env.ORBIT_NATIVE_SMOKE_ORIGIN ?? "https://slab.tail0da701.ts.net:9443";
const url = new URL(origin);
assert.equal(url.protocol, "https:");
assert.ok(url.hostname.endsWith(".ts.net"));
assert.equal(url.port, "9443");
assert.equal(url.origin, origin);
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const fixturePath = fileURLToPath(new URL("ios_review_fixture.mjs", import.meta.url));
const bundle = "com.withorbit.native";
const axe = process.env.ORBIT_AXE_BINARY ?? "/opt/homebrew/bin/axe";
const tailscale = process.env.ORBIT_TAILSCALE_BINARY ?? "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
const run = (command, args) => execFileSync(command, args, { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const fixture = (...args) => run(process.execPath, ["--experimental-transform-types", fixturePath, ...args]);
const simctl = (...args) => run("xcrun", ["simctl", ...args]);
const plist = (file, key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, file]).trim();
const sleep = millis => new Promise(resolve => setTimeout(resolve, millis));
const beforeServe = JSON.parse(run(tailscale, ["serve", "status", "--json"]));
assert.ok(!beforeServe.TCP?.["9443"], "Refusing to replace an existing Serve9443 route");
assert.ok(!Object.keys(beforeServe.Web ?? {}).some(key => key.endsWith(":9443")));
await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once("error", reject);
  probe.listen(8788, "127.0.0.1", () => probe.close(resolve));
});
const app = simctl("get_app_container", udid, bundle, "app").trim();
const container = simctl("get_app_container", udid, bundle, "data").trim();
assert.ok(container.includes(`/CoreSimulator/Devices/${udid}/data/Containers/Data/Application/`));
assert.match(plist(path.join(app, "Info.plist"), "CFBundleSupportedPlatforms"), /iPhoneSimulator/);
assert.equal(plist(path.join(app, "Expo.plist"), "EXUpdatesURL"), `${origin}/updates/manifest`);
assert.equal(plist(path.join(app, "Expo.plist"), "EXUpdatesEnabled"), "true", "JS fallback requires a real enabled Expo updates runtime");
const installedBuild = Number(plist(path.join(app, "Info.plist"), "CFBundleVersion"));
assert.ok(Number.isSafeInteger(installedBuild) && installedBuild > 0);

let server, logFD, receipt, paired = false, addedServe = false;
const ui = () => run(axe, ["describe-ui", "--udid", udid]);
async function waitText(text) {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (ui().includes(text)) return;
    await sleep(500);
  }
  if (receipt) await screenshot("failed");
  throw new Error(`Timed out waiting for ${text}`);
}
function tap(label, style = "physical") {
  run(axe, ["tap", "--label", label, "--element-type", "Button", "--tap-style", style, "--wait-timeout", "10", "--post-delay", "0.25", "--udid", udid]);
}
function elementWithLabel(nodes, label) {
  for (const node of nodes) {
    if (node.AXLabel === label) return node;
    const child = elementWithLabel(node.children ?? [], label);
    if (child) return child;
  }
}
async function checkUpdate() {
  const anchor = elementWithLabel(JSON.parse(ui()), "Menu")?.frame;
  assert.ok(anchor, "Expected the ordinary review menu button");
  tap("Menu");
  await sleep(500);
  if (ui().includes("Check for app update")) tap("Check for app update");
  else {
    // AXe on iOS26.5 omits the rendered RN Modal's children. Screenshot the
    // real menu, then tap its observed last row: 8pt gap + 3pt border + four
    // 44pt rows + two 3pt dividers + half the final row. No app test branch.
    await screenshot("menu-coordinate-fallback");
    run(axe, ["tap", "-x", String(anchor.x + anchor.width - 80), "-y", String(anchor.y + anchor.height + 8 + 3 + 4 * 44 + 2 * 3 + 22),
      "--tap-style", "physical", "--post-delay", "0.25", "--udid", udid]);
  }
}
async function screenshot(name) {
  simctl("io", udid, "screenshot", path.join(receipt.directory, `${name}.png`));
  await fs.writeFile(path.join(receipt.directory, `${name}-ui.json`), ui());
}
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = once(server, "exit");
  server.kill("SIGTERM");
  const timer = setTimeout(() => server.kill("SIGKILL"), 20_000);
  try {
    const [code] = await stopped;
    assert.equal(code, 0, "Disposable server must flush and stop cleanly");
  } finally { clearTimeout(timer); }
}
let cleaning;
function cleanup() {
  if (cleaning) return cleaning;
  cleaning = (async () => {
    const errors = [];
    if (paired) {
      try { simctl("terminate", udid, bundle); } catch { /* Already stopped. */ }
      try { fixture("restore-simulator", receipt.receiptPath, container); }
      catch (error) { errors.push(error); }
    }
    try { await stopServer(); } catch (error) { errors.push(error); }
    if (logFD !== undefined) closeSync(logFD);
    if (addedServe) {
      try {
        run(tailscale, ["serve", "--https=9443", "off"]);
        assert.deepEqual(JSON.parse(run(tailscale, ["serve", "status", "--json"])), beforeServe, "Only the test route should have changed");
      } catch (error) { errors.push(error); }
    }
    if (receipt) console.log(`Native update Simulator receipt: ${receipt.directory}`);
    if (errors.length) throw new AggregateError(errors, "Simulator fixture cleanup failed");
  })();
  return cleaning;
}
for (const [signal, status] of [["SIGINT", 130], ["SIGTERM", 143]]) {
  process.once(signal, () => void cleanup().finally(() => process.exit(status)));
}

try {
  try { simctl("terminate", udid, bundle); } catch { /* Already stopped. */ }
  const prepared = JSON.parse(fixture("prepare"));
  receipt = { ...JSON.parse(await fs.readFile(prepared.receiptPath, "utf8")), receiptPath: prepared.receiptPath };
  fixture("pair-simulator", receipt.receiptPath, container);
  paired = true;
  // Deliberately not an IPA. It exists only in the isolated test server; no OS
  // installation is possible and nothing is published to the live Lab.
  const fakeIPA = path.join(receipt.directory, "simulator-only-not-an-ipa");
  await fs.writeFile(fakeIPA, "Simulator handoff fixture, not an installable IPA.");
  const { publishNativeRelease } = await import("../../automerge-sync-server/dist/updates/nativeRelease.js");
  const publish = buildNumber => publishNativeRelease({ ipaPath: fakeIPA, updatesRoot: path.join(receipt.directory, "updates"), origin,
    buildNumber: String(buildNumber), version: "1.0.0", bundleIdentifier: bundle });
  await publish(installedBuild + 1);
  logFD = openSync(path.join(receipt.directory, "server.log"), "a", 0o600);
  server = spawn(process.execPath, [path.join(checkout, "packages/automerge-sync-server/dist/index.js"), "--config", receipt.configurationPath], { stdio: ["ignore", logFD, logFD] });
  for (let attempt = 0; ; attempt++) {
    assert.equal(server.exitCode, null, "Disposable server exited");
    if (await fetch("http://127.0.0.1:8788/_ready").then(response => response.ok).catch(() => false)) break;
    assert.ok(attempt < 30, "Disposable server readiness timed out");
    await sleep(500);
  }
  run(tailscale, ["serve", "--bg", "--https=9443", "http://127.0.0.1:8788"]);
  addedServe = true;
  assert.ok((await fetch(`${origin}/_ready`)).ok);
  simctl("launch", "--terminate-running-process", udid, bundle);
  const firstPrompt = receipt.prompts[0];
  await waitText(firstPrompt);
  await checkUpdate();
  await waitText("New app build available");
  await screenshot("native-offer");
  tap("Later");
  await waitText(firstPrompt);
  await checkUpdate();
  await waitText("New app build available");
  tap("Install");
  await sleep(2_000);
  const handoffState = ui();
  const handoffOutcome = handoffState.includes("Could not start installation")
    ? "rejected-with-safe-alert"
    : handoffState.includes(firstPrompt)
      ? "accepted-without-observable-installation"
      : "handed-to-system-ui";
  await screenshot("simulator-install-handoff");
  if (handoffOutcome === "rejected-with-safe-alert") tap("OK");
  else if (handoffOutcome === "handed-to-system-ui") simctl("launch", udid, bundle);
  await waitText(firstPrompt);
  fixture("verify-server", receipt.receiptPath, "0");
  await publish(installedBuild);
  await checkUpdate();
  await waitText("Orbit Lab is up to date");
  await screenshot("same-native-build-js-fallback");
  tap("OK");
  await fs.unlink(path.join(receipt.directory, "updates", "native.json"));
  await checkUpdate();
  await waitText("Orbit Lab is up to date");
  await screenshot("missing-native-release-js-fallback");
  tap("OK");
  await waitText(firstPrompt);
  tap("Show Answer");
  await waitText("Remembered");
  tap("Remembered");
  await waitText(receipt.prompts[1]);
  fixture("verify-server", receipt.receiptPath, "1");
  simctl("launch", "--terminate-running-process", udid, bundle);
  await waitText(receipt.prompts[1]);
  await screenshot("review-saved-after-update-checks");
  await stopServer();
  await checkUpdate();
  await waitText("Could not check for an update");
  await screenshot("unreachable-laptop");
  tap("OK");
  await waitText(receipt.prompts[1]);
  await fs.writeFile(path.join(receipt.directory, "native-update-proof.json"), JSON.stringify({
    simulatorUDID: udid, installedBuild, offeredBuild: installedBuild + 1, origin,
    laterPreservedPrompt: true, handoffOutcome, installHandoffDidNotMutateReviews: true,
    sameAndMissingReleaseReachedJSFallback: true, reviewedObservationCount: 1,
    coldRelaunchPreservedReview: true, unreachableLaptopPreservedReviewQueue: true,
    physicalOTAInstallationVerified: false,
  }, null, 2));
  console.log(`Release Simulator native update gate passed: Later, installer handoff (${handoffOutcome}), same/missing native JS fallback, review persistence and cold relaunch.`);
} finally {
  await cleanup();
}
