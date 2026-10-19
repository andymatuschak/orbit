// Real Release app + Home Screen WidgetKit + disposable Repo. No app UI hooks,
// phone, live Lab, reinstall, or disposable-projection seeding shortcuts.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { openSync, closeSync } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scripts = path.dirname(fileURLToPath(import.meta.url));
const checkout = path.resolve(scripts, "../../..");
const fixtureScript = path.join(scripts, "ios_review_fixture.mjs");
const bundle = "com.withorbit.native";
const groupID = "group.com.withorbit.native";
const connectionKey = "com.withorbit.lab.connection.v1";
const port = 8788;
const upstreamPort = 8789;
const require = createRequire(path.join(checkout, "package.json"));
const sleep = millis => new Promise(resolve => setTimeout(resolve, millis));
const run = (command, args, timeout = 30_000, env = process.env) => execFileSync(command, args,
  { encoding: "utf8", timeout, killSignal: "SIGKILL", env, maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"] }).trim();
const runAsync = (command, args, timeout) => new Promise((resolve, reject) => {
  execFile(command, args, { encoding: "utf8", timeout, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 },
    (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
});
const sim = (...args) => run("xcrun", ["simctl", ...args]);
const optional = file => fs.readFile(file).catch(error => { if (error.code === "ENOENT") return null; throw error; });
async function save(file, value) { await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); }
async function atomic(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.widget-handoff-gate`;
  await fs.writeFile(temporary, bytes, { mode: 0o600 });
  await fs.rename(temporary, file);
}
async function timeout(operation, millis, message) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), millis);
  })]); } finally { clearTimeout(timer); }
}
async function until(predicate, millis, message) {
  const deadline = Date.now() + millis;
  do { if (await predicate()) return; await sleep(200); } while (Date.now() < deadline);
  throw new Error(message);
}

// A child-process boundary additionally caps the whole read, including an
// awaited Repo.find/shutdown. A polling deadline alone cannot bound those calls.
async function verifyRemote(receipt, expected) {
  assert.equal(receipt.serviceOrigin, "http://127.0.0.1:8788");
  const { Repo } = require("@automerge/automerge-repo");
  const WebSocket = require("ws");
  const { decodeAtomicTree } = require("@withorbit/store-automerge");
  const { AuthenticatedWebSocketNetworkAdapter } = require("@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter");
  const { decodePerTaskVaultRoot, decodePerTaskVaultCatalog, decodePerTaskVaultTask } = require("@withorbit/store-shared/perTaskCodec");
  const network = new AuthenticatedWebSocketNetworkAdapter("ws://127.0.0.1:8788/v1/sync",
    async () => ({ kind: "pairedToken", token: "orbit-lab-review-smoke-disposable-fixture-token" }),
    { retryIntervalMillis: 500, webSocketFactory: { create: url => new WebSocket(url, { origin: "http://localhost:8081" }) } });
  const repo = new Repo({ network: [network], isEphemeral: true,
    shareConfig: { announce: async () => true, access: async () => true } });
  try {
    return await timeout((async () => {
      await network.whenReady();
      const decoded = handle => decodeAtomicTree(handle.fullDoc(), "$document");
      const root = decodePerTaskVaultRoot(decoded(await repo.find(receipt.rootDocumentURL)));
      assert.equal(root.vaultID, receipt.vaultID);
      const catalog = decodePerTaskVaultCatalog(decoded(await repo.find(root.catalogCandidates[0].documentURL)));
      const ids = [...expected.widget.map(record => record.taskID), ...expected.appTaskIDs];
      const handles = await Promise.all(ids.map(id => repo.find(catalog.entries[id].documentURL)));
      let observations;
      // Pure codecs avoid starting domain catalog repair in this independent
      // verifier. A first snapshot can precede subsequent sync messages.
      await until(async () => {
        observations = Object.assign({}, ...handles.map(handle => decodePerTaskVaultTask(decoded(handle)).observations));
        return Object.keys(observations).length >= ids.length;
      }, 15_000, "Reviewed task observations did not converge");
      assert.equal(Object.keys(observations).length, ids.length, "Each fixture task must have exactly one review");
      for (const record of expected.widget) {
        const saved = observations[record.observationID];
        assert.ok(saved, `Missing widget observation ${record.observationID}`);
        for (const field of ["taskID", "componentID", "outcome", "occurredAtTimestampMillis"])
          assert.equal(saved[field], record[field], `Widget observation changed ${field}`);
      }
      for (const taskID of ids) {
        const matches = Object.entries(observations).filter(([, value]) => value.taskID === taskID);
        assert.equal(matches.length, 1);
        assert.equal(matches[0][1].outcome, "remembered");
      }
      for (const [id, saved] of Object.entries(expected.remoteObservations ?? {}))
        assert.deepEqual(observations[id], saved, `Previously delivered observation changed: ${id}`);
      return observations;
    })(), 20_000, "Whole fresh-peer read timed out");
  } finally { await timeout(repo.shutdown(), 2_000, "Fresh-peer shutdown timed out"); }
}

if (process.argv[2] === "--verify") {
  const receipt = JSON.parse(await fs.readFile(process.argv[3]));
  const expected = JSON.parse(await fs.readFile(process.argv[4]));
  const result = await verifyRemote(receipt, expected);
  console.log(JSON.stringify(result));
  process.exit(0);
}
if (process.argv.includes("--help")) {
  console.log("Set ORBIT_SIMULATOR_UDID to a dedicated, booted Simulator with the current Release app installed and its medium Orbit widget at the top of Home Screen.");
  console.log("Requires AXe, Xcode/Vision, Node, built workspace/server, and free localhost8788/8789. Never builds, installs, touches a phone, or connects to live8787.");
  console.log("Tests four widget reviews across disconnect/import/reconnect, two app reviews followed immediately by Home, and another widget import; verifies exact server observation IDs.");
  console.log("Preserves/restores selected pairing plus exact shared widget JSON/preferences, including all original pending reviews. Retains private receipts/screenshots/logs on success or failure.");
  process.exit(0);
}

const udid = process.env.ORBIT_SIMULATOR_UDID;
assert.match(udid ?? "", /^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/, "Set an explicit dedicated ORBIT_SIMULATOR_UDID");
const axe = process.env.ORBIT_AXE_BINARY ?? "/opt/homebrew/bin/axe";
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-widget-handoff-gate."));
await fs.chmod(directory, 0o700);
console.log(`Widget handoff evidence: ${directory}`);
const env = { ...process.env, ORBIT_SMOKE_CATALOG_TASK_COUNT: "53", ORBIT_SMOKE_MIXED_QUEUE: "0" };
// Public FSRS defaults, not personal weights or a second fixture-only scheduler.
const weightsFile = path.join(directory, "weights.json");
await save(weightsFile, createRequire(path.join(checkout, "packages/core/package.json"))("ts-fsrs").default_w);
env.ORBIT_SMOKE_FSRS_WEIGHTS = weightsFile;
const fixture = (...args) => run(process.execPath, ["--experimental-transform-types", fixtureScript, ...args], 60_000, env);
const installedApp = sim("get_app_container", udid, bundle, "app");
const container = sim("get_app_container", udid, bundle, "data");
assert.ok(container.includes(`/CoreSimulator/Devices/${udid}/data/Containers/Data/Application/`));
assert.ok(await optional(path.join(installedApp, "main.jsbundle")), "Install a Release build first; this gate never builds or installs");
const plist = (file, key) => run("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(installedApp, file)]);
assert.match(plist("Info.plist", "CFBundleSupportedPlatforms"), /iPhoneSimulator/);
assert.equal(plist("Expo.plist", "EXUpdatesURL"), "http://127.0.0.1:8788/updates/manifest",
  "Build the Simulator with EXPO_PUBLIC_ORBIT_LAB_ORIGIN=http://127.0.0.1:8788 so startup cannot load a live checkpoint");
const installedBuild = plist("Info.plist", "CFBundleVersion");
if (process.env.ORBIT_EXPECTED_NATIVE_BUILD) assert.equal(installedBuild, process.env.ORBIT_EXPECTED_NATIVE_BUILD);
const group = sim("get_app_container", udid, bundle, "groups").split("\n").find(line => line.startsWith(`${groupID}\t`))?.split("\t")[1];
assert.ok(group?.includes(`/CoreSimulator/Devices/${udid}/data/Containers/Shared/AppGroup/`));
const manifestFile = path.join(container, "Library/Application Support", bundle, "RCTAsyncLocalStorage_V1/manifest.json");
const sharedFiles = ["orbit-widget-v3.json", `Library/Preferences/${groupID}.plist`];
const handoffFile = path.join(group, sharedFiles[0]);
const ocr = path.join(directory, "widget-ocr");
const ui = () => JSON.parse(run(axe, ["describe-ui", "--udid", udid]));
const flatten = nodes => nodes.flatMap(node => [node, ...flatten(node.children ?? [])]);
// Fast OCR sees Orbit's numeral1 as capitalI in this fixture's answer prefix.
// Keep that glyph equivalence local to this exact test label, not prompt data.
const compact = value => value.replace(/\banswer\s+[il](?=\s*:)/gi, "Answer 1")
  .toLowerCase().replace(/[^a-z0-9]/g, "");
let receipt, before, selected = false, server, serverFD, appPID, widgetPoint;
let relay, relayOnline = true;
const relaySockets = new Set();
const expected = { widget: [], appTaskIDs: [] };
const expectedFile = path.join(directory, "expected-reviews.json");
async function event(name, detail = {}) {
  const record = { name, timestamp: new Date().toISOString(), ...detail };
  await fs.appendFile(path.join(directory, "events.jsonl"), JSON.stringify(record) + "\n");
  console.log(JSON.stringify(record));
}
async function screenshot(name) {
  const file = path.join(directory, `${name}.png`);
  sim("io", udid, "screenshot", file);
  await save(path.join(directory, `${name}-ax.json`), ui());
  return file;
}
async function state(name) {
  const bytes = await fs.readFile(handoffFile);
  const value = JSON.parse(bytes);
  assert.equal(value.selectedVaultID, receipt.vaultID);
  await fs.writeFile(path.join(directory, `${name}.json`), bytes, { mode: 0o600 });
  return value;
}
async function assertQueue(index, name, full = false) {
  let queue;
  await until(async () => {
    queue = (await state(`${name}-handoff`)).queue;
    return queue[0]?.task.id === receipt.taskIDs[index]
      && (!full || queue.length === Math.min(50, receipt.taskIDs.length - index));
  },
    10_000, `Widget JSON did not advance to task${index + 1}`);
  assert.deepEqual(queue.map(item => [item.task.id, item.componentID]),
    receipt.taskIDs.slice(index, index + queue.length).map(id => [id, "main"]), "Projection queue order/membership changed");
  if (full) assert.equal(queue.length, Math.min(50, receipt.taskIDs.length - index), "Fresh app projection must replenish the whole due window");
}
async function assertScreen(text, name) {
  await until(async () => {
    const file = await screenshot(name);
    const recognized = await runAsync(ocr, [file, "--widget-fast-cpu"], 8_000);
    await fs.writeFile(path.join(directory, `${name}-ocr.txt`), recognized);
    return compact(recognized).includes(compact(text));
  }, 15_000, `Widget did not visibly show: ${text}`);
}
async function waitApp(text) {
  await until(() => flatten(ui()).some(node => node.AXLabel?.includes(text)), 15_000, `App did not display: ${text}`);
}
function tapApp(label) {
  run(axe, ["tap", "--label", label, "--element-type", "Button", "--tap-style", "physical", "--wait-timeout", "10", "--post-delay", "0", "--udid", udid]);
}
function launch() {
  const result = sim("launch", `--stdout=/tmp/${path.basename(directory)}/app.stdout.log`,
    `--stderr=/tmp/${path.basename(directory)}/app.stderr.log`, udid, bundle);
  const pid = Number(result.match(/:\s*(\d+)\s*$/)?.[1]);
  assert.ok(pid > 0);
  if (appPID) assert.equal(pid, appPID, "Foreground tests must retain the same app process");
  appPID = pid;
}
async function home() {
  run(axe, ["button", "home", "--udid", udid]);
  await until(() => {
    const nodes = ui();
    return nodes[0]?.pid !== appPID && flatten(nodes).some(node => node.AXLabel === "Orbit Lab" && node.frame?.width > 200);
  }, 10_000, "Home action did not expose the medium Orbit widget");
  const widget = flatten(ui()).find(node => node.AXLabel === "Orbit Lab" && node.frame?.width > 200)?.frame;
  assert.ok(widget && widget.y < 200 && widget.height > 100 && widget.height < 300, "Place the medium widget at the top of Home Screen");
  widgetPoint = { x: widget.x + widget.width - 28, y: widget.y + widget.height - 54 };
}
async function widgetReview(index) {
  await assertQueue(index, `widget-${index + 1}-front`);
  await assertScreen(receipt.prompts[index], `widget-${index + 1}-front`);
  const tap = () => run(axe, ["tap", "-x", String(widgetPoint.x), "-y", String(widgetPoint.y),
    "--tap-style", "physical", "--post-delay", "0", "--udid", udid]);
  tap();
  await assertScreen(`Answer ${index + 1}: ordinary paired Repo sync.`, `widget-${index + 1}-revealed`);
  tap();
  await assertQueue(index + 1, `widget-${index + 1}-accepted`);
  const records = (await state(`widget-${index + 1}-accepted`)).pendingReviews.filter(record => record.vaultID === receipt.vaultID);
  const added = records.find(record => record.taskID === receipt.taskIDs[index]);
  assert.ok(added, "Actual widget intent did not durably queue its review");
  assert.ok(!expected.widget.some(record => record.observationID === added.observationID));
  expected.widget.push(added);
  await event("widget-review-accepted", { taskIndex: index, observationID: added.observationID });
}
async function importWidget(index, full = true) {
  launch();
  await waitApp(receipt.prompts[index]);
  await until(async () => !(await state("imported-handoff")).pendingReviews.some(record => record.vaultID === receipt.vaultID),
    10_000, "App did not acknowledge its durably imported widget reviews");
  await assertQueue(index, "imported", full);
  await event("widget-imported", { nextTaskIndex: index });
}
async function appReviewThenImmediateHome(index) {
  await waitApp(receipt.prompts[index]);
  tapApp("Show Answer");
  await waitApp("Remembered");
  await event("app-review-and-immediate-home", { taskIndex: index });
  tapApp("Remembered");
  // Completed-review workflow: wait only for the actual next card, then Home.
  // Never wait for widget JSON, remote delivery, or a fixed settling delay.
  await waitApp(receipt.prompts[index + 1]);
  await home();
  expected.appTaskIDs.push(receipt.taskIDs[index]);
  await assertQueue(index + 1, `after-app-${index + 1}`, true);
  await assertScreen(receipt.prompts[index + 1], `after-app-${index + 1}`);
}
async function verify() {
  await save(expectedFile, expected);
  // Keep this process's TCP relay pumping during the independent peer's read.
  const result = JSON.parse(await runAsync(process.execPath, [fileURLToPath(import.meta.url), "--verify", receipt.receiptPath, expectedFile], 25_000));
  await save(path.join(directory, `server-${expected.widget.length + expected.appTaskIDs.length}.json`), result);
  await event("server-reviews-verified", { observationIDs: Object.keys(result) });
  expected.remoteObservations = result;
  return result;
}
async function startRelay() {
  relay = net.createServer(client => {
    if (!relayOnline) { client.destroy(); return; }
    const upstream = net.connect(upstreamPort, "127.0.0.1");
    for (const socket of [client, upstream]) {
      relaySockets.add(socket);
      socket.on("error", () => { client.destroy(); upstream.destroy(); });
      socket.on("close", () => { relaySockets.delete(socket); client.destroy(); upstream.destroy(); });
    }
    client.pipe(upstream).pipe(client);
  });
  await new Promise((resolve, reject) => {
    relay.once("error", reject);
    relay.listen(port, "127.0.0.1", resolve);
  });
}
async function setRelayOnline(online) {
  relayOnline = online;
  if (!online) for (const socket of relaySockets) socket.destroy();
  assert.equal(server.exitCode, null, "The same server Repo must survive the disconnect");
  await event(online ? "same-peer-relay-resumed" : "same-peer-relay-disconnected", { serverPID: server.pid });
}
async function startServer() {
  serverFD = openSync(path.join(directory, "server.log"), "a", 0o600);
  server = spawn(process.execPath, [path.join(checkout, "packages/automerge-sync-server/dist/index.js"), "--config", receipt.configurationPath],
    { stdio: ["ignore", serverFD, serverFD] });
  await until(async () => {
    assert.equal(server.exitCode, null, "Disposable server exited");
    return await fetch(`http://127.0.0.1:${upstreamPort}/_ready`, { signal: AbortSignal.timeout(1_000) }).then(response => response.ok).catch(() => false);
  }, 15_000, "Disposable server did not become ready");
}
async function stopServer() {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGTERM");
    try {
      await until(() => server.exitCode !== null || server.signalCode !== null, 15_000, "Disposable server did not stop");
      assert.equal(server.exitCode, 0, "Disposable server must flush cleanly");
    } catch (error) { server.kill("SIGKILL"); throw error; }
  }
  server = undefined;
  if (serverFD !== undefined) closeSync(serverFD);
  serverFD = undefined;
}
let cleaning;
function cleanup() {
  return cleaning ??= (async () => {
    const errors = [];
    try { sim("terminate", udid, bundle); } catch { /* Already stopped. */ }
    if (relay) {
      for (const socket of relaySockets) socket.destroy();
      try { await timeout(new Promise(resolve => relay.close(resolve)), 3_000, "Test relay did not close"); }
      catch (error) { errors.push(error); }
    }
    try { await stopServer(); } catch (error) { errors.push(error); }
    if (before && selected) {
      try {
        const manifest = JSON.parse((await optional(manifestFile))?.toString() ?? "{}");
        if (manifest[connectionKey] !== before.connection)
          assert.equal(JSON.parse(manifest[connectionKey]).localStoreID, receipt.localStoreID, "Refusing to overwrite a different new selection");
        if (before.connection === null) delete manifest[connectionKey]; else manifest[connectionKey] = before.connection;
        await atomic(manifestFile, JSON.stringify(manifest));
        for (const [relative, bytes] of Object.entries(before.files)) {
          const file = path.join(group, relative);
          if (bytes === null) { if (await optional(file)) await fs.unlink(file); }
          else await atomic(file, Buffer.from(bytes, "base64"));
          assert.equal((await optional(file))?.toString("base64") ?? null, bytes);
        }
        assert.equal(JSON.parse(await fs.readFile(manifestFile))[connectionKey] ?? null, before.connection);
        await sleep(500);
        for (const [relative, bytes] of Object.entries(before.files))
          assert.equal((await optional(path.join(group, relative)))?.toString("base64") ?? null, bytes,
            "Restored widget files changed after cleanup");
        await save(path.join(directory, "restored.json"), { pairingExact: true, widgetJSONAndPreferencesByteExact: true,
          preservedPendingReviews: before.files[sharedFiles[0]] ? JSON.parse(Buffer.from(before.files[sharedFiles[0]], "base64")).pendingReviews.length : 0 });
      } catch (error) { errors.push(error); }
    }
    for (const name of ["app.stdout.log", "app.stderr.log"]) {
      const file = path.join(path.dirname(path.dirname(path.dirname(path.dirname(container)))), "tmp", path.basename(directory), name);
      try { await fs.copyFile(file, path.join(directory, name)); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, "Widget handoff cleanup failed; retained backup requires inspection");
  })();
}
for (const [signal, status] of [["SIGINT", 130], ["SIGTERM", 143]])
  process.once(signal, () => void cleanup().finally(() => process.exit(status)));

try {
  for (const candidate of [port, upstreamPort]) await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(candidate, "127.0.0.1", () => probe.close(resolve));
  });
  run("xcrun", ["swiftc", "-module-cache-path", path.join(directory, "swift-cache"), "-framework", "AppKit", "-framework", "Vision",
    path.join(scripts, "widget_ui_smoke_ocr.swift"), "-o", ocr], 60_000);
  try { sim("terminate", udid, bundle); } catch { /* Already stopped. */ }
  const manifest = JSON.parse((await optional(manifestFile))?.toString() ?? "{}");
  before = { connection: manifest[connectionKey] ?? null, files: Object.fromEntries(await Promise.all(sharedFiles.map(async relative =>
    [relative, (await optional(path.join(group, relative)))?.toString("base64") ?? null]))) };
  await save(path.join(directory, "before.json"), before);
  const prepared = JSON.parse(fixture("prepare"));
  receipt = { ...JSON.parse(await fs.readFile(prepared.receiptPath)), receiptPath: prepared.receiptPath };
  // A process restart gives JS Repo a different peer ID and would miss the
  // stale same-peer sync-state regression. Drop TCP, not the server Repo.
  const config = JSON.parse(await fs.readFile(receipt.configurationPath));
  config.port = upstreamPort;
  await save(receipt.configurationPath, config);
  receipt.installedBuild = installedBuild;
  receipt.runtimeVersion = plist("Expo.plist", "EXUpdatesRuntimeVersion");
  await save(path.join(directory, "fixture.json"), receipt);
  selected = true;
  fixture("pair-simulator", receipt.receiptPath, container);
  await startServer();
  await startRelay();
  receipt.serverPID = server.pid;
  await save(path.join(directory, "fixture.json"), receipt);
  launch();
  await waitApp(receipt.prompts[0]);
  await assertQueue(0, "initial", true);
  await home();
  for (let index = 0; index < 4; index++) await widgetReview(index);
  // The app imports locally while its previously connected socket disappears.
  // Reconnect must re-enroll those histories, even though review ack is local.
  await setRelayOnline(false);
  // A fresh offline cache legitimately lacks the last three replenishment
  // tasks. Require its exact available prefix now, and the full window online.
  await importWidget(4, false);
  await setRelayOnline(true);
  await verify();
  await assertQueue(4, "reconnected", true);
  await appReviewThenImmediateHome(4);
  await verify();
  await widgetReview(5);
  await importWidget(6);
  await appReviewThenImmediateHome(6);
  await verify();
  await save(path.join(directory, "passed.json"), { widgetReviews: expected.widget.length, appReviews: expected.appTaskIDs.length,
    exactServerObservationIDs: Object.keys(expected.remoteObservations) });
  console.log("Release Home Screen handoff passed: repeated Reveal/review, offline import/reconnect, immediate-Home app reviews, exact server IDs.");
} catch (error) {
  try { await screenshot("failed"); } catch { /* Preserve original error. */ }
  throw error;
} finally { await cleanup(); }
