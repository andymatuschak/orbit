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
  console.log("Optionally set ORBIT_NATIVE_SMOKE_CHECKPOINT_EXPORT to a current Expo iOS export to update an existing compatible binary through the real JS update menu first.");
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
const run = (command, args, timeout = 60_000) => execFileSync(command, args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "pipe"] });
// Preparing the real 14,000-document fixture durably writes thousands of files;
// keep that bounded separately from individual UI commands and assertions.
const fixture = (...args) => run(process.execPath, ["--experimental-transform-types", fixturePath, ...args], args[0] === "prepare" ? 300_000 : 60_000);
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
const runtimeVersion = plist(path.join(app, "Expo.plist"), "EXUpdatesRuntimeVersion");
const checkpointExport = process.env.ORBIT_NATIVE_SMOKE_CHECKPOINT_EXPORT;

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
function launch(...options) {
  const result = simctl("launch", ...options, udid, bundle);
  const pid = result.match(/:\s*(\d+)\s*$/)?.[1];
  assert.ok(pid, `Expected the ordinary app process ID from simctl: ${result}`);
  return pid;
}
async function foreground(pid) {
  run(axe, ["button", "home", "--udid", udid]);
  // Observe the actual Home transition after one hardware-button action. The
  // accessibility tree can lag the animation; a fixed delay mistakes that lag
  // for an app failure, while a repeated Home press can mask a missed action.
  for (let attempt = 0; attempt < 30; attempt++) {
    const state = ui();
    const visiblePID = JSON.parse(state)[0]?.pid;
    if (Number.isInteger(visiblePID) && String(visiblePID) !== pid && !state.includes("Show Answer")) {
      (receipt.foregroundTransitions ??= []).push({ appPID: pid, backgroundVisiblePID: visiblePID });
      assert.equal(launch(), pid, "Foreground checks must use the same process, not a cold launch");
      return;
    }
    await sleep(250);
  }
  await screenshot("home-did-not-background");
  throw new Error("A single Home action did not observably background the review UI");
}
async function waitCheckpointLaunched(checkpoint) {
  assert.match(checkpoint.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  const directory = path.join(container, "Library", "Application Support", ".expo-internal");
  const database = (await fs.readdir(directory)).filter(name => /^expo-v\d+\.db$/.test(name));
  assert.equal(database.length, 1, "Expected one ordinary Expo update database");
  for (let attempt = 0; attempt < 30; attempt++) {
    // Expo records a successful launch only after RCTContentDidAppear for this
    // exact update. A repeated prompt string cannot prove which JS is active.
    const row = run("/usr/bin/sqlite3", ["-readonly", path.join(directory, database[0]),
      `SELECT successful_launch_count, failed_launch_count FROM updates WHERE id = X'${checkpoint.id.replaceAll("-", "")}';`]).trim();
    if (row) {
      const [successful, failed] = row.split("|").map(Number);
      assert.equal(failed, 0, "The checkpoint must not have failed a native Expo launch");
      if (successful > 0) {
        (receipt.activatedCheckpoints ??= []).push({ checkpointID: checkpoint.id, successfulLaunchCount: successful, failedLaunchCount: failed });
        return;
      }
    }
    await sleep(500);
  }
  await screenshot("checkpoint-did-not-activate");
  throw new Error(`Expo did not record a successful launch of checkpoint ${checkpoint.id}`);
}
async function assertReviewUninterrupted(prompt, { revealed = false, durationMillis = 2_500 } = {}) {
  const until = Date.now() + durationMillis;
  do {
    const state = ui();
    assert.ok(state.includes(prompt), "An update check must preserve the current question");
    assert.ok(state.includes(revealed ? "Remembered" : "Show Answer"));
    for (const alert of ["New app build available", "App update ready", "Could not check for an update"])
      assert.ok(!state.includes(alert), `An automatic check must not interrupt a question: ${alert}`);
    await sleep(250);
  } while (Date.now() < until);
}
async function waitNativeOffer(build) {
  await waitText("New app build available");
  assert.ok(ui().includes(`(${build})?`), `Expected native build ${build}`);
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
  let bootstrapCheckpoint, publishJSCheckpoint;
  if (checkpointExport) {
    // A real checkpoint lets this JavaScript-only change run on the existing
    // optimized Release binary. Publication remains inside the disposable Lab;
    // the normal automatic alert and Expo reload activate it, without UI test branches.
    const expoConfig = JSON.parse(execFileSync(process.execPath,
      [path.join(checkout, "node_modules/expo/bin/cli"), "config", "--type", "public", "--json"], {
        cwd: path.join(checkout, "packages/app"),
        env: { ...process.env, EXPO_PUBLIC_ORBIT_LAB_ORIGIN: origin, CI: "1" },
        encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
      }));
    assert.equal(expoConfig.runtimeVersion, runtimeVersion, "The checkpoint must match this binary's native runtime");
    assert.equal(expoConfig.updates?.url, `${origin}/updates/manifest`);
    const { publishCheckpoint } = await import("../../automerge-sync-server/dist/updates/checkpoint.js");
    publishJSCheckpoint = () => publishCheckpoint({ exportDirectory: checkpointExport,
      updatesRoot: path.join(receipt.directory, "updates"), origin, runtimeVersion, expoConfig });
    bootstrapCheckpoint = await publishJSCheckpoint();
  }
  // Deliberately not an IPA. It exists only in the isolated test server; no OS
  // installation is possible and nothing is published to the live Lab.
  const fakeIPA = path.join(receipt.directory, "simulator-only-not-an-ipa");
  await fs.writeFile(fakeIPA, "Simulator handoff fixture, not an installable IPA.");
  const { publishNativeRelease } = await import("../../automerge-sync-server/dist/updates/nativeRelease.js");
  const publish = buildNumber => publishNativeRelease({ ipaPath: fakeIPA, updatesRoot: path.join(receipt.directory, "updates"), origin,
    buildNumber: String(buildNumber), version: "1.0.0", bundleIdentifier: bundle });
  if (!bootstrapCheckpoint) await publish(installedBuild + 1);
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
  let pid = launch("--terminate-running-process");
  const firstPrompt = receipt.prompts[0];
  if (bootstrapCheckpoint) {
    await waitText("App update ready");
    await screenshot("current-source-checkpoint-ready");
    tap("Reload now");
    await waitCheckpointLaunched(bootstrapCheckpoint);
    await waitText(firstPrompt);
    await publish(installedBuild + 1);
    await foreground(pid);
  }
  await waitNativeOffer(installedBuild + 1);
  await screenshot("automatic-offer-immediately-on-foreground");
  // No review is needed to see the update; the existing card is untouched.
  fixture("verify-server", receipt.receiptPath, "0");
  tap("Later");
  await waitText(firstPrompt);
  tap("Show Answer");
  await waitText("Remembered");
  await assertReviewUninterrupted(firstPrompt, { revealed: true });
  tap("Remembered");
  fixture("verify-server", receipt.receiptPath, "1");
  await waitText(receipt.prompts[1]);
  await foreground(pid);
  await waitText(receipt.prompts[1]);
  await assertReviewUninterrupted(receipt.prompts[1]);
  await screenshot("dismissed-build-not-reoffered-on-foreground");

  // Manual checks deliberately override automatic session suppression.
  await checkUpdate();
  await waitNativeOffer(installedBuild + 1);
  await screenshot("manual-reoffer-after-later");
  tap("Install");
  await sleep(2_000);
  const handoffState = ui();
  const handoffOutcome = handoffState.includes("Could not start installation")
    ? "rejected-with-safe-alert"
    : handoffState.includes(receipt.prompts[1])
      ? "accepted-without-observable-installation"
      : "handed-to-system-ui";
  await screenshot("simulator-install-handoff");
  if (handoffOutcome === "rejected-with-safe-alert") tap("OK");
  else if (handoffOutcome === "handed-to-system-ui") assert.equal(launch(), pid);
  await waitText(receipt.prompts[1]);
  fixture("verify-server", receipt.receiptPath, "1");
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

  // Use the fixture's existing JavaScript peer for task two. This retains its
  // independent three-review verifier and exercises a genuine remote queue
  // update before the next immediate foreground offer.
  fixture("js-review-second", receipt.receiptPath);
  await waitText(receipt.prompts[2]);
  tap("Show Answer");
  await waitText("Remembered");
  let foregroundCheckpoint;
  if (publishJSCheckpoint) {
    // A new manifest ID is a real Expo update even when its code/assets match.
    // Download on true foreground and offer immediately, without a review.
    foregroundCheckpoint = await publishJSCheckpoint();
    assert.notEqual(foregroundCheckpoint.id, bootstrapCheckpoint.id);
  } else await publish(installedBuild + 2);
  await foreground(pid);
  if (foregroundCheckpoint) await waitText("App update ready");
  else await waitNativeOffer(installedBuild + 2);
  await screenshot(foregroundCheckpoint ? "automatic-js-offer-immediately-on-foreground" : "new-build-discovered-on-true-foreground");
  fixture("verify-server", receipt.receiptPath, "2");
  tap("Later");
  await waitText(receipt.prompts[2]);
  await waitText("Remembered");
  await assertReviewUninterrupted(receipt.prompts[2], { revealed: true });
  tap("Remembered");
  fixture("verify-server", receipt.receiptPath, "3");
  const remainingPrompt = receipt.prompts[3];
  await waitText(remainingPrompt);
  pid = launch("--terminate-running-process");
  if (foregroundCheckpoint) await waitCheckpointLaunched(foregroundCheckpoint);
  else { await waitNativeOffer(installedBuild + 2); tap("Later"); }
  await waitText(remainingPrompt);
  await screenshot("review-saved-after-update-checks");
  await stopServer();
  await foreground(pid);
  await waitText(remainingPrompt);
  await assertReviewUninterrupted(remainingPrompt, { durationMillis: 6_000 });
  await screenshot("unreachable-laptop-automatic-check-quiet");
  await checkUpdate();
  await waitText("Could not check for an update");
  await screenshot("unreachable-laptop");
  tap("OK");
  await waitText(remainingPrompt);
  await fs.writeFile(path.join(receipt.directory, "native-update-proof.json"), JSON.stringify({
    simulatorUDID: udid, installedBuild,
    offeredBuilds: [installedBuild + 1, ...(!foregroundCheckpoint ? [installedBuild + 2] : [])], origin,
    runtimeVersion, bootstrapCheckpointID: bootstrapCheckpoint?.id,
    automaticJSCheckpointID: foregroundCheckpoint?.id,
    activatedCheckpoints: receipt.activatedCheckpoints,
    foregroundTransitions: receipt.foregroundTransitions,
    currentSourceActivatedThroughRealJSUpdate: !!bootstrapCheckpoint,
    realJavaScriptForegroundOfferWithoutReview: !!foregroundCheckpoint,
    automaticNativeOfferWithoutReview: true,
    foregroundOfferWhileAnswerRevealed: true,
    laterPreservedFrontAndRevealedQuestion: true,
    trueBackgroundForegroundKeptSameProcess: true,
    laterSuppressedSameBuildOnForeground: true,
    newReleaseDiscoveredOnForeground: true,
    manualCheckReofferedDismissedBuild: true,
    laterPreservedPrompt: true, handoffOutcome, installHandoffDidNotMutateReviews: true,
    sameAndMissingReleaseReachedJSFallback: true, reviewedObservationCount: 3,
    coldRelaunchPreservedReview: true, unreachableLaptopPreservedReviewQueue: true,
    unreachableAutomaticForegroundCheckWasQuiet: true,
    physicalOTAInstallationVerified: false,
  }, null, 2));
  console.log(`Release Simulator native update gate passed: immediate foreground offers without a review${foregroundCheckpoint ? " (native and real JavaScript checkpoint)" : ""}, Later suppression, manual reoffer, installer handoff (${handoffOutcome}), same/missing native JS fallback, review persistence and cold relaunch.`);
} finally {
  await cleanup();
}
