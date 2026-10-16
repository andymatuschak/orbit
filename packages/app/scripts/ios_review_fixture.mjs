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
  prepare                         create 53 due tasks plus future tasks for the large catalog
  pair-simulator RECEIPT CONTAINER select it in a stopped Simulator app
  restore-simulator RECEIPT CONTAINER restore the previous Lab selection
  verify-server RECEIPT COUNT      fetch observations through a fresh JS peer
  js-review-second RECEIPT         review task two through ordinary Repo sync
  verify-native RECEIPT CONTAINER COUNT read only cached reviewed tasks/catalog/PNG
  verify-image RECEIPT SCREENSHOT  assert the PNG appears in the offline UI`);
  process.exit(0);
}
const simulatorUDID = process.env.ORBIT_SIMULATOR_UDID;
assert.match(simulatorUDID ?? "", /^[A-Fa-f0-9]{8}(?:-[A-Fa-f0-9]{4}){3}-[A-Fa-f0-9]{12}$/, "Set an explicit dedicated ORBIT_SIMULATOR_UDID");
const checkout = fileURLToPath(new URL("../../../", import.meta.url));
const require = createRequire(path.join(checkout, "package.json"));
const WebSocket = require("ws");
const Automerge = await import("@automerge/automerge");
const { Repo, parseAutomergeUrl } = require("@automerge/automerge-repo");
const { AttachmentMIMEType, TaskContentType, TaskSpecType, TaskRepetitionOutcome, defaultOrbitSchedulerPolicy, defaultReviewSessionMaximumQueueSize, generateUniqueID, projectVault } = require("@withorbit/core");
const { RepoPerTaskDocuments, BinaryPerTaskDocuments, RepoAutomergeAttachmentWriter } = require("@withorbit/store-automerge");
const { PerTaskRepository } = require("@withorbit/store-shared/perTaskRepository");
const { decodePerTaskVaultRoot, decodePerTaskVaultCatalog, decodePerTaskVaultTask } = require("@withorbit/store-shared/perTaskCodec");
const { AtomicNodeFSStorageAdapter } = await import("../../automerge-sync-server/dist/storage/atomicNodeFSStorageAdapter.js");
const { ensureStorageID } = await import("../../automerge-sync-server/dist/storage/storageMetadata.js");
const { AuthenticatedWebSocketNetworkAdapter } = await import("@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter");
const bundleID = "com.withorbit.native";
const connectionKey = "com.withorbit.lab.connection.v1";
const pairingToken = "orbit-lab-review-smoke-disposable-fixture-token";
const reviewedTaskCount = 3;
const syncWindowSize = 50;
// A real-vault regression: URLSession's default 1 MiB limit used to let small
// reviews upload while preventing the larger catalog from reaching the phone.
const catalogTaskCount = Number(process.env.ORBIT_SMOKE_CATALOG_TASK_COUNT ?? 14_000);
assert.ok(Number.isInteger(catalogTaskCount) && catalogTaskCount >= 53 && catalogTaskCount <= 20_000);
const prompts = [
  "Orbit Lab native sync: phone review reaches JavaScript",
  "Orbit Lab native sync: JavaScript review advances phone",
  "Orbit Lab native sync: offline review survives reconnect",
  ...Array.from({ length: syncWindowSize }, (_, index) => `Orbit Lab native sync: filler task ${String(index + 4).padStart(2, "0")}`),
];
assert.equal(defaultReviewSessionMaximumQueueSize, syncWindowSize, "Update the fixture if the ordinary sync window changes");

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
    // Scheduler variants are ordinary fixture data, never branches in app UI.
    const scheduler = process.env.ORBIT_SMOKE_FSRS_WEIGHTS ? {
      kind: "fsrs", version: 1, modelVersion: 6,
      weights: JSON.parse(await fs.readFile(process.env.ORBIT_SMOKE_FSRS_WEIGHTS, "utf8")),
      requestedRetention: 0.9, cutoverTimestampMillis: Date.now() - 60_000,
      previousPolicy: defaultOrbitSchedulerPolicy,
    } : defaultOrbitSchedulerPolicy;
    const mixedQueue = process.env.ORBIT_SMOKE_MIXED_QUEUE === "1";
    assert.ok(!mixedQueue || scheduler.kind === "fsrs", "Mixed-queue gate needs personalized FSRS weights");
    const historyTimes = taskIDs.map((_, index) => Date.now() -
      (index % 2 === 0 ? 10 + index / 2 : 200 - (index - 1) / 2) * 86_400_000 + index);
    const futureTasks = Object.fromEntries(Array.from({ length: catalogTaskCount - prompts.length }, (_, index) => {
      const taskID = generateUniqueID();
      return [taskID, { isDeleted: false, createdAtTimestampMillis: 4_102_444_800_000 + index,
        spec: { type: TaskSpecType.Memory, content: { type: TaskContentType.QA,
          body: { text: `Future catalog task ${index}`, attachments: [] },
          answer: { text: "Not due in this test", attachments: [] },
        } }, provenance: null, metadata: {},
      }];
    }));
    vault = await PerTaskRepository.create(new RepoPerTaskDocuments(repo), {
      vaultID: `lab-review-smoke-${generateUniqueID()}`, createdAtTimestampMillis: 1_700_000_000_000,
      scheduler, tasks: futureTasks, observations: {}, attachments: { [attachmentID]: attachment.catalogEntry },
    });
    await vault.apply(prompts.map((text, index) => ({
      kind: "ingestTask", mutationID: `fixture/ingest/${index}`,
      task: { taskID: taskIDs[index], createdAtTimestampMillis: mixedQueue ? historyTimes[index] - 86_400_000 : 1_700_000_000_000 + index,
        spec: { type: TaskSpecType.Memory, content: { type: TaskContentType.QA,
          body: { text, attachments: index === 2 ? [attachmentID] : [] },
          answer: { text: `Answer ${index + 1}: ordinary paired Repo sync.`, attachments: [] },
        } }, provenance: null, metadata: { fixture: "ios-review-smoke", fixtureIndex: String(index) },
      },
    })));
    if (mixedQueue) {
      // Real ordinary history: even tasks are most recallable, odd tasks are
      // oldest due. The first high-R task lies outside the oldest-50 window.
      await vault.apply(taskIDs.map((taskID, index) => ({
        kind: "recordReview", mutationID: `fixture/history/${index}`,
        observationID: `fixture/history/${index}`, taskID, componentID: "main",
        reviewSessionID: "fixture-history", outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: historyTimes[index],
      })));
    }
    const logical = await readFixtureLogical({ repo, vault }, { taskIDs });
    assertFixtureTasks({ taskIDs, prompts }, logical.tasks, taskIDs);
    assertCatalogWindow({ taskIDs, mixedQueue }, await vault.getCatalogEntries(), 0);
    const queue = await vault.getReviewQueue();
    assert.equal(queue.length, syncWindowSize, "The ordinary review queue is capped, unlike the full catalog");
    assert.deepEqual(queue.slice(0, reviewedTaskCount).map(item => item.task.spec.content.body.text), prompts.slice(0, reviewedTaskCount));
    assert.equal(sha256((await vault.readAttachment(attachmentID)).bytes), sha256(png));
    let catalogDocument = Automerge.clone((await repo.find(vault.catalogURL)).fullDoc());
    // The first response to a fresh peer contains the catalog's actual changes,
    // not an uncompressed-size estimate or an unrelated padded WebSocket frame.
    const empty = Automerge.init();
    const [, request] = Automerge.generateSyncMessage(empty, Automerge.initSyncState());
    const received = Automerge.receiveSyncMessage(catalogDocument, Automerge.initSyncState(), request);
    catalogDocument = received[0];
    const serverState = received[1];
    const [, response] = Automerge.generateSyncMessage(catalogDocument, serverState);
    Automerge.free(empty);
    Automerge.free(catalogDocument);
    const catalogSyncBytes = response.byteLength;
    if (catalogTaskCount >= 14_000) assert.ok(catalogSyncBytes > 1024 * 1024, "Large-catalog gate must cross URLSession's old receive limit");
    await repo.flush();
    const configurationPath = path.join(directory, "config.json");
    await fs.writeFile(configurationPath, JSON.stringify({ storageRoot, rootDocumentURL: vault.rootURL, pairingToken, updatesRoot,
      allowedOrigins: ["http://localhost:8081", "http://127.0.0.1:8081"], port: 8788 }), { mode: 0o600 });
    const receipt = { directory, configurationPath, storageRoot, rootDocumentURL: vault.rootURL, vaultID: vault.vaultID,
      simulatorUDID, bundleID, serviceOrigin: "http://127.0.0.1:8788", localStoreID: `lab-${generateUniqueID()}`,
      taskIDs, prompts, catalogTaskCount, catalogSyncBytes, scheduler, mixedQueue, attachmentID, attachmentSHA256: sha256(png), jsReviewObservationID: `review/${generateUniqueID()}` };
    const receiptPath = path.join(directory, "receipt.json");
    await fs.writeFile(receiptPath, JSON.stringify(receipt), { mode: 0o600 });
    console.log(JSON.stringify({ receiptPath, configurationPath, directory, rootDocumentURL: vault.rootURL,
      catalogTaskCount, catalogSyncBytes, reviewQueueCount: queue.length, reviewedTaskCount }));
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
  assert.equal(receipt.serviceOrigin, "http://127.0.0.1:8788");
  assert.equal(receipt.storageRoot, path.join(receipt.directory, "repo"));
  assert.equal(receipt.taskIDs.length, prompts.length, "Use a fresh 53-task regression fixture");
  assert.deepEqual(receipt.prompts, prompts);
  assert.equal(receipt.catalogTaskCount, catalogTaskCount);
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

function assertFixtureTasks(receipt, tasks, taskIDs) {
  assert.equal(Object.keys(tasks).length, taskIDs.length);
  for (const id of taskIDs) {
    const index = receipt.taskIDs.indexOf(id);
    assert.deepEqual(tasks[id].metadata, { fixture: "ios-review-smoke", fixtureIndex: String(index) });
    assert.equal(tasks[id].spec.content.body.text, receipt.prompts[index]);
  }
}

function assertCatalogWindow(receipt, entries, expectedReviews) {
  assert.equal(Object.keys(entries).length, receipt.catalogTaskCount ?? catalogTaskCount, "Catalog must retain due and future tasks");
  // Independent of getReviewWorkingSetDocumentURLs/getReviewQueue: inspect the catalog's
  // complete due ordering without materializing any native task document.
  const ranked = Object.entries(entries).sort(([leftID, left], [rightID, right]) =>
    left.nextDueTimestampMillis - right.nextDueTimestampMillis || leftID.localeCompare(rightID));
  for (const [, entry] of ranked) {
    assert.equal(entry.isDeleted, false);
    assert.ok(Number.isFinite(entry.nextDueTimestampMillis));
    assert.ok(entry.indexedTaskHeads.length > 0);
  }
  const firstWindow = ranked.slice(0, syncWindowSize).map(([id]) => id);
  if (receipt.mixedQueue) {
    if (expectedReviews === 0) assert.ok(!firstWindow.includes(receipt.taskIDs[0]), "Highest-R task must be outside oldest-50 to test global selection");
  } else assert.deepEqual(firstWindow, receipt.taskIDs.slice(expectedReviews, expectedReviews + syncWindowSize));
  const reviewedRanks = receipt.taskIDs.slice(0, expectedReviews).map(id => ranked.findIndex(([taskID]) => taskID === id));
  for (const rank of reviewedRanks) assert.ok(rank >= syncWindowSize, "Reviewed task must leave the ordinary 50-task sync window");
  if (expectedReviews === reviewedTaskCount) assert.deepEqual([...reviewedRanks].sort((a, b) => a - b), [50, 51, 52]);
  return reviewedRanks;
}

function assertReviews(receipt, source, expected) {
  assert.ok(Number.isInteger(expected) && expected >= 0 && expected <= reviewedTaskCount, "Expected count 0 through 3");
  const observations = Object.entries(source).filter(([id]) => !id.startsWith("fixture/history/"));
  if (receipt.mixedQueue) for (const [id, observation] of Object.entries(source).filter(([id]) => id.startsWith("fixture/history/"))) {
    assert.equal(observation.kind, "review");
    assert.equal(observation.taskID, receipt.taskIDs[Number(id.slice("fixture/history/".length))]);
    assert.equal(observation.outcome, TaskRepetitionOutcome.Remembered);
    assert.ok(observation.occurredAtTimestampMillis < receipt.scheduler.cutoverTimestampMillis);
  }
  assert.equal(observations.length, expected, `Expected exactly ${expected} observations`);
  for (let index = 0; index < expected; index++) {
    const matches = observations.filter(([, value]) => value.taskID === receipt.taskIDs[index]);
    assert.equal(matches.length, 1, `Expected one review for fixture task ${index + 1}`);
    assert.equal(matches[0][1].kind, "review");
    assert.equal(matches[0][1].outcome, TaskRepetitionOutcome.Remembered);
  }
  if (expected >= 2) assert.ok(source[receipt.jsReviewObservationID], "Expected JS review ID missing");
}

function assertFSRSSchedules(receipt, logical, entries, expected) {
  if (receipt.scheduler?.kind !== "fsrs") return;
  assert.deepEqual(logical.scheduler, receipt.scheduler);
  const tasks = projectVault({ document: logical }).tasks;
  for (const id of receipt.taskIDs.slice(0, expected)) {
    const state = tasks.get(id).componentStates.main;
    assert.ok(state.fsrs && state.fsrs.stability > 0 && Number.isFinite(state.fsrs.difficulty), "FSRS memory must be reconstructed from the saved review");
    const review = Object.values(logical.observations).find(value => value.taskID === id && value.occurredAtTimestampMillis >= receipt.scheduler.cutoverTimestampMillis);
    assert.equal(state.fsrs.lastReviewTimestampMillis, review.occurredAtTimestampMillis);
    assert.ok(state.intervalMillis >= 86_400_000);
    assert.equal(state.dueTimestampMillis, review.occurredAtTimestampMillis + state.intervalMillis);
    assert.equal(entries[id].nextDueTimestampMillis, state.dueTimestampMillis, "Persisted catalog must use FSRS, not the old scheduler");
  }
}

async function verifyServer(receipt, expected) {
  const client = await openJS(receipt);
  try {
    let logical;
    await eventually(async () => { logical = await readFixtureLogical(client, receipt); return Object.keys(logical.observations).length === expected + (receipt.mixedQueue ? prompts.length : 0); });
    assertFixtureTasks(receipt, logical.tasks, receipt.taskIDs);
    assertReviews(receipt, logical.observations, expected);
    let reviewedRanks;
    // Catalog and authoritative task updates need not arrive in the same frame.
    await eventually(async () => {
      try { reviewedRanks = assertCatalogWindow(receipt, await client.vault.getCatalogEntries(), expected); return true; }
      catch (error) { if (error.code === "ERR_ASSERTION") return false; throw error; }
    });
    assertFSRSSchedules(receipt, logical, await client.vault.getCatalogEntries(), expected);
    if (receipt.mixedQueue) {
      const queue = await client.vault.getReviewQueue();
      assert.deepEqual(queue.slice(0, 6).map(item => item.task.id), receipt.taskIDs.slice(expected, expected + 6), "Saved reviews must alternate the first lane on every rebuild");
    }
    console.log(JSON.stringify({ serverVerified: true, scheduler: logical.scheduler.kind, mixedQueue: receipt.mixedQueue, catalogTaskCount: receipt.catalogTaskCount, catalogSyncBytes: receipt.catalogSyncBytes, observationCount: expected, reviewedRanks }));
  } finally { await client.vault.close(); await client.repo.shutdown(); }
}

async function reviewSecond(receipt) {
  const client = await openJS(receipt);
  try {
    assertReviews(receipt, (await readFixtureLogical(client, receipt)).observations, 1);
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
  try {
    // Pure decoding only: opening a domain repository would start catalog
    // repair and make a supposedly independent proof attempt writes.
    const rootSnapshot = await documents.read(receipt.rootDocumentURL, { localOnly: true });
    assert.ok(rootSnapshot, "Fixture root is missing from the native cache");
    const vaultRoot = decodePerTaskVaultRoot(rootSnapshot.data);
    assert.equal(vaultRoot.vaultID, receipt.vaultID);
    assert.equal(vaultRoot.catalogCandidates.length, 1, "This fixture has exactly one catalog generation");
    const candidate = vaultRoot.catalogCandidates[0];
    const catalogSnapshot = await documents.read(candidate.documentURL, { localOnly: true, heads: candidate.initialCatalogHeads });
    assert.ok(catalogSnapshot, "Fixture catalog is missing from the native cache");
    assert.equal(catalogSnapshot.hasRequestedHeads, true, "Native catalog must contain its announced initial heads");
    const catalog = decodePerTaskVaultCatalog(catalogSnapshot.data);
    assert.equal(catalog.vaultID, receipt.vaultID);
    assert.equal(catalog.generation, candidate.generation);
    const entries = catalog.entries;
    const reviewedRanks = assertCatalogWindow(receipt, entries, expected);
    const tasks = {};
    const observations = {};
    // Never reopen the phone's native Repo handles. These stopped-app bytes
    // prove local durability without activating sync before the cold relaunch.
    // The last two fillers need not have entered the native cache yet.
    for (const taskID of receipt.taskIDs.slice(0, reviewedTaskCount)) {
      const snapshot = await documents.read(entries[taskID].documentURL, { localOnly: true });
      assert.ok(snapshot, "Reviewed task is missing from the native cache");
      const document = decodePerTaskVaultTask(snapshot.data);
      assert.equal(document.vaultID, receipt.vaultID);
      assert.equal(document.taskID, taskID);
      tasks[taskID] = document.task;
      Object.assign(observations, document.observations);
    }
    assertFixtureTasks(receipt, tasks, receipt.taskIDs.slice(0, reviewedTaskCount));
    assertReviews(receipt, observations, expected);
    assertFSRSSchedules(receipt, { ...vaultRoot, scheduler: vaultRoot.scheduler, tasks, observations }, entries, expected);
    const attachment = vaultRoot.attachments[receipt.attachmentID];
    assert.ok(attachment, "Fixture PNG metadata is missing from the native root");
    assert.equal(sha256((await documents.readAttachment(attachment)).bytes), receipt.attachmentSHA256);
    console.log(JSON.stringify({ nativeFilesVerified: true, cachedTasksChecked: reviewedTaskCount,
      catalogTaskCount: receipt.catalogTaskCount, catalogSyncBytes: receipt.catalogSyncBytes, attachmentVerified: true, observationCount: expected, reviewedRanks }));
  } finally { await documents.close(); }
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
async function readFixtureLogical(client, receipt) {
  // Verify the 53 due/reviewed documents independently, without fetching the
  // thousands of future task bodies that neither review client needs to open.
  const documents = new RepoPerTaskDocuments(client.repo);
  try {
    const root = decodePerTaskVaultRoot((await documents.read(client.vault.rootURL)).data);
    const entries = await client.vault.getCatalogEntries();
    const tasks = {}, observations = {};
    for (const taskID of receipt.taskIDs) {
      const task = decodePerTaskVaultTask((await documents.read(entries[taskID].documentURL)).data);
      tasks[taskID] = task.task;
      Object.assign(observations, task.observations);
    }
    return { ...root, tasks, observations };
  } finally { await documents.close(); }
}
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
