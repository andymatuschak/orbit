// Disposable real-Repo fixture for run_ios_review_smoke.sh; never seed a phone.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [action, argument, containerOrCount, count] = process.argv.slice(2);
if (!action || action === "--help") {
  console.log(`Run with node --experimental-transform-types. Set ORBIT_SIMULATOR_UDID.
  prepare                         create an independent three-task vault/config
  pair-simulator RECEIPT CONTAINER select it in a stopped Simulator app
  restore-simulator RECEIPT CONTAINER restore the previous Lab selection
  verify-server RECEIPT COUNT      fetch observations through a fresh JS peer
  js-review-second RECEIPT         review task two through ordinary Repo sync
  verify-native RECEIPT CONTAINER COUNT read the stopped app's actual Repo files
  verify-image RECEIPT SCREENSHOT  assert the PNG appears in the offline UI`);
  process.exit(0);
}
const simulatorUDID = process.env.ORBIT_SIMULATOR_UDID;
assert.match(simulatorUDID ?? "", /^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/, "Set an explicit dedicated ORBIT_SIMULATOR_UDID");
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(checkout, "package.json"));
const WebSocket = require("ws");
const { Repo, parseAutomergeUrl } = require("@automerge/automerge-repo");
const { AttachmentMIMEType, TaskContentType, TaskSpecType, TaskRepetitionOutcome, defaultOrbitSchedulerPolicy, generateUniqueID } = require("@withorbit/core");
const { RepoPerTaskDocuments, BinaryPerTaskDocuments, RepoAutomergeAttachmentWriter } = require("@withorbit/store-automerge");
const { PerTaskRepository } = require("@withorbit/store-shared/perTaskRepository");
const { AtomicNodeFSStorageAdapter } = await import("../../automerge-sync-server/dist/storage/atomicNodeFSStorageAdapter.js");
const { ensureStorageID } = await import("../../automerge-sync-server/dist/storage/storageMetadata.js");
const { AuthenticatedWebSocketNetworkAdapter } = await import("../src/sync/AuthenticatedWebSocketNetworkAdapter.ts");
const bundleID = "com.withorbit.native";
const connectionKey = "com.withorbit.lab.connection.v1";
const pairingToken = "orbit-lab-review-smoke-disposable-fixture-token";
const prompts = [
  "Orbit Lab native sync: phone review reaches JavaScript",
  "Orbit Lab native sync: JavaScript review advances phone",
  "Orbit Lab native sync: offline review survives reconnect",
];

async function prepare() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "orbit-lab-review-gate."));
  await fs.chmod(directory, 0o700);
  const storageRoot = path.join(directory, "repo");
  const updatesRoot = path.join(directory, "updates");
  await Promise.all([storageRoot, updatesRoot].map(dir => fs.mkdir(dir, { mode: 0o700 })));
  const storage = new AtomicNodeFSStorageAdapter(storageRoot);
  await ensureStorageID(storage);
  const repo = new Repo({ storage, network: [], isEphemeral: false });
  let vault;
  try {
    const taskIDs = prompts.map(() => generateUniqueID());
    const attachmentID = generateUniqueID();
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGMQSbnznxLMMGrAqAGjBgwXAwBGSVMf1FEybQAAAABJRU5ErkJggg==", "base64");
    await fs.writeFile(path.join(directory, "fixture.png"), png, { mode: 0o600 });
    const attachment = await new RepoAutomergeAttachmentWriter(repo).prepare({ attachmentID, bytes: png, mediaTypeHint: AttachmentMIMEType.PNG });
    vault = await PerTaskRepository.create(new RepoPerTaskDocuments(repo), {
      vaultID: `lab-review-smoke-${generateUniqueID()}`, createdAtTimestampMillis: 1_700_000_000_000,
      scheduler: defaultOrbitSchedulerPolicy, tasks: {}, observations: {}, attachments: { [attachmentID]: attachment.catalogEntry },
    });
    await vault.apply(prompts.map((text, index) => ({
      kind: "ingestTask", mutationID: `fixture/ingest/${index}`,
      task: { taskID: taskIDs[index], createdAtTimestampMillis: 1_700_000_000_000 + index,
        spec: { type: TaskSpecType.Memory, content: { type: TaskContentType.QA,
          body: { text, attachments: index === 2 ? [attachmentID] : [] },
          answer: { text: `Answer ${index + 1}: ordinary paired Repo sync.`, attachments: [] },
        } }, provenance: null, metadata: { fixture: "ios-review-smoke" },
      },
    })));
    assert.deepEqual((await vault.getReviewQueue()).map(item => item.task.spec.content.body.text), prompts);
    assert.equal(sha256((await vault.readAttachment(attachmentID)).bytes), sha256(png));
    await repo.flush();
    const configurationPath = path.join(directory, "config.json");
    await fs.writeFile(configurationPath, JSON.stringify({ storageRoot, rootDocumentURL: vault.rootURL, pairingToken, updatesRoot,
      allowedOrigins: ["http://localhost:8081", "http://127.0.0.1:8081"], port: 8787 }), { mode: 0o600 });
    const receipt = { directory, configurationPath, storageRoot, rootDocumentURL: vault.rootURL, vaultID: vault.vaultID,
      simulatorUDID, bundleID, serviceOrigin: "http://127.0.0.1:8787", localStoreID: `lab-${generateUniqueID()}`,
      taskIDs, prompts, attachmentID, attachmentSHA256: sha256(png), jsReviewObservationID: `review/${generateUniqueID()}` };
    const receiptPath = path.join(directory, "receipt.json");
    await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    console.log(JSON.stringify({ receiptPath, configurationPath, directory, rootDocumentURL: vault.rootURL }));
  } finally { await vault?.close(); await repo.shutdown(); }
}

async function readReceipt(filename) {
  const receipt = JSON.parse(await fs.readFile(filename, "utf8"));
  const directory = await fs.realpath(receipt.directory);
  const temporaryRoot = await fs.realpath(os.tmpdir());
  assert.ok(directory.startsWith(path.join(temporaryRoot, "orbit-lab-review-gate.")), "Refusing a non-fixture directory");
  assert.equal(path.dirname(await fs.realpath(filename)), directory);
  assert.equal(receipt.simulatorUDID, simulatorUDID, "Receipt belongs to a different Simulator");
  assert.equal(receipt.bundleID, bundleID);
  assert.equal(receipt.serviceOrigin, "http://127.0.0.1:8787");
  assert.equal(receipt.storageRoot, path.join(receipt.directory, "repo"));
  return receipt;
}

async function assertStoppedContainer(container) {
  const resolved = await fs.realpath(container);
  assert.ok(resolved.includes(`/CoreSimulator/Devices/${simulatorUDID}/data/Containers/Data/Application/`), "Refusing a non-dedicated-Simulator container");
  const actual = execFileSync("xcrun", ["simctl", "get_app_container", simulatorUDID, bundleID, "data"], { encoding: "utf8" }).trim();
  assert.equal(resolved, await fs.realpath(actual), "Container is not this Simulator's installed Orbit app");
  const services = execFileSync("xcrun", ["simctl", "spawn", simulatorUDID, "launchctl", "list"], { encoding: "utf8" });
  assert.ok(!services.split("\n").some(line => /^\s*\d+\s/.test(line) && /(?:UIKitApplication|application)[:.]com\.withorbit\.native(?:\[|\.|$)/.test(line) && !line.includes("com.withorbit.native.widget")), "Stop the app before touching or independently reading its storage");
}

async function selectSimulator(receipt, container, restore) {
  await assertStoppedContainer(container);
  const manifestPath = path.join(container, "Library", "Application Support", bundleID, "RCTAsyncLocalStorage_V1", "manifest.json");
  const backup = path.join(receipt.directory, "simulator-asyncstorage-before-pairing.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const old = (await optionalRead(manifestPath))?.toString("utf8") ?? "{}";
  const manifest = JSON.parse(old);
  if (restore) {
    const original = JSON.parse(await fs.readFile(backup, "utf8"));
    assert.equal(JSON.parse(manifest[connectionKey] ?? "{}").localStoreID, receipt.localStoreID, "Refusing to overwrite a new Lab selection");
    if (Object.hasOwn(original, connectionKey)) manifest[connectionKey] = original[connectionKey];
    else delete manifest[connectionKey];
  } else {
    await fs.writeFile(backup, old, { mode: 0o600, flag: "wx" });
    manifest[connectionKey] = JSON.stringify({ serviceOrigin: receipt.serviceOrigin, token: pairingToken,
      rootDocumentURL: receipt.rootDocumentURL, localStoreID: receipt.localStoreID });
  }
  const temporary = `${manifestPath}.lab-review-fixture`;
  await fs.writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 });
  await fs.rename(temporary, manifestPath);
  console.log(JSON.stringify({ simulatorSelectionRestored: restore, keptOtherRecords: true }));
}

async function openJS(receipt) {
  const storage = new AtomicNodeFSStorageAdapter(await fs.mkdtemp(path.join(receipt.directory, "js-peer-")));
  await ensureStorageID(storage);
  const network = new AuthenticatedWebSocketNetworkAdapter(`${receipt.serviceOrigin.replace("http", "ws")}/v1/sync`,
    async () => ({ kind: "pairedToken", token: pairingToken }), { retryIntervalMillis: 500,
      webSocketFactory: { create: url => new WebSocket(url, { origin: "http://localhost:8081" }) } });
  const repo = new Repo({ storage, network: [network], isEphemeral: false, shareConfig: { announce: async () => true, access: async () => true } });
  try {
    await timeout(network.whenReady(), 10_000, "Fixture server was not ready");
    const vault = await PerTaskRepository.open(new RepoPerTaskDocuments(repo), receipt.rootDocumentURL);
    assert.equal(vault.vaultID, receipt.vaultID, "Refusing a different logical vault");
    return { repo, vault };
  } catch (error) { await repo.shutdown(); throw error; }
}

function assertReviews(receipt, logical, expected) {
  assert.ok(Number.isInteger(expected) && expected >= 0 && expected <= 3, "Expected count 0 through 3");
  assert.equal(Object.keys(logical.tasks).length, 3);
  const observations = Object.entries(logical.observations);
  assert.equal(observations.length, expected, `Expected exactly ${expected} observations`);
  for (let index = 0; index < expected; index++) {
    const matches = observations.filter(([, value]) => value.taskID === receipt.taskIDs[index]);
    assert.equal(matches.length, 1, `Expected one review for fixture task ${index + 1}`);
    assert.equal(matches[0][1].kind, "review");
    assert.equal(matches[0][1].outcome, TaskRepetitionOutcome.Remembered);
  }
  if (expected >= 2) assert.ok(logical.observations[receipt.jsReviewObservationID], "Expected JS review ID missing");
}

async function verifyServer(receipt, expected) {
  const client = await openJS(receipt);
  try {
    let logical;
    await eventually(async () => { logical = await client.vault.readLogicalVault(); return Object.keys(logical.observations).length === expected; });
    assertReviews(receipt, logical, expected);
    console.log(JSON.stringify({ serverVerified: true, observationCount: expected }));
  } finally { await client.vault.close(); await client.repo.shutdown(); }
}

async function reviewSecond(receipt) {
  const client = await openJS(receipt);
  try {
    assertReviews(receipt, await client.vault.readLogicalVault(), 1);
    await client.vault.apply([{ kind: "recordReview", mutationID: receipt.jsReviewObservationID, observationID: receipt.jsReviewObservationID,
      taskID: receipt.taskIDs[1], componentID: "main", reviewSessionID: "lab-review-smoke-js", outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: Date.now() }]);
    // A local apply is not delivery proof: independently fetch through the server.
    await verifyServer(receipt, 2);
  } finally { await client.vault.close(); await client.repo.shutdown(); }
}

async function verifyNative(receipt, container, expected) {
  await assertStoppedContainer(container);
  const root = path.join(container, "Library", "Application Support", "Orbit", "Automerge", "repos", sha256(Buffer.from(receipt.localStoreID)));
  const documents = new BinaryPerTaskDocuments({
    async load(url) {
      const directory = path.join(root, parseAutomergeUrl(url).documentId);
      const snapshot = await optionalRead(path.join(directory, "snapshot.automerge"));
      const range = path.join(directory, "ranges", sha256(Buffer.from("incrChanges")));
      const names = await fs.readdir(range).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      const chunks = await Promise.all(names.filter(name => name.endsWith(".amchange")).sort().map(name => fs.readFile(path.join(range, name))));
      return snapshot || chunks.length ? Buffer.concat([snapshot ?? Buffer.alloc(0), ...chunks]) : undefined;
    },
    async save() { throw new Error("Independent native verification is read-only"); },
  });
  const vault = await PerTaskRepository.open(documents, receipt.rootDocumentURL);
  try {
    assert.equal(vault.vaultID, receipt.vaultID);
    assertReviews(receipt, await vault.readLogicalVault(), expected);
    assert.equal(sha256((await vault.readAttachment(receipt.attachmentID)).bytes), receipt.attachmentSHA256);
    console.log(JSON.stringify({ nativeFilesVerified: true, attachmentVerified: true, observationCount: expected }));
  } finally { await vault.close(); }
}

function verifyImage(receipt, screenshot) {
  // AppKit is already present on the Simulator host; no image parser dependency.
  execFileSync("swift", ["-module-cache-path", path.join(receipt.directory, "swift-cache"), "-e", `import AppKit
    let image = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))!
    let fixture = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))!
    let target = fixture.colorAt(x: 0, y: 0)!.usingColorSpace(.deviceRGB)!
    var matches = 0
    for y in stride(from: image.pixelsHigh / 10, to: image.pixelsHigh * 9 / 10, by: 4) {
      for x in stride(from: 0, to: image.pixelsWide, by: 4) {
        let pixel = image.colorAt(x: x, y: y)!.usingColorSpace(.deviceRGB)!
        if abs(pixel.redComponent - target.redComponent) < 0.01 && abs(pixel.greenComponent - target.greenComponent) < 0.01 && abs(pixel.blueComponent - target.blueComponent) < 0.01 { matches += 1 }
      }
    }
    guard matches >= 16 else { fputs("Fixture PNG was not visible in the offline UI\\n", stderr); exit(1) }
  `, screenshot, path.join(receipt.directory, "fixture.png")], { timeout: 60_000, stdio: "pipe" });
  console.log(JSON.stringify({ offlineImageVisible: true, screenshot }));
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function optionalRead(filename) { try { return await fs.readFile(filename); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; } }
function timeout(promise, millis, message) { let timer; return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), millis); })]).finally(() => clearTimeout(timer)); }
async function eventually(predicate) { for (let attempt = 0; attempt < 100; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("Timed out waiting for fixture convergence"); }

if (action === "prepare") await prepare();
else {
  const receipt = await readReceipt(argument);
  if (action === "pair-simulator" || action === "restore-simulator") await selectSimulator(receipt, containerOrCount, action === "restore-simulator");
  else if (action === "verify-server") await verifyServer(receipt, Number(containerOrCount));
  else if (action === "js-review-second") await reviewSecond(receipt);
  else if (action === "verify-native") await verifyNative(receipt, containerOrCount, Number(count));
  else if (action === "verify-image") verifyImage(receipt, containerOrCount);
  else throw new Error("Unknown action; run --help");
}
