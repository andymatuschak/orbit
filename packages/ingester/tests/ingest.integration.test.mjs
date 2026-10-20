import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, test as nodeTest } from "node:test";
import { Repo, cbor, generateAutomergeUrl } from "@automerge/automerge-repo";
import { WebSocketServer } from "ws";
import {
  AtomicNodeFSStorageAdapter,
  acquireWriterLock,
  LabSyncService,
} from "@withorbit/automerge-sync-server";
import { RepoPerTaskDocuments } from "@withorbit/store-automerge";
import { AuthenticatedWebSocketNetworkAdapter } from "@withorbit/store-automerge/authenticatedWebSocketNetworkAdapter";
import { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import {
  defaultOrbitSchedulerPolicy,
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import { runIngest } from "../dist/bin/run.js";
import {
  prepareMarkdownStamps,
  runMarkdownIngest,
} from "../../interpreter/dist/bin/ingest.js";
import { hashTaskSpec } from "../../interpreter/dist/hashTaskSpec.js";

const directories = [];
const services = [];
const test = (name, fn) => nodeTest(name, { timeout: 15000 }, fn);
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

test("a paired importer publishes new documents, preserves reviews, and cold repeat is a no-op", async () => {
  const fixture = await startFixture();
  const input = {
    sources: [
      {
        identifier: "note",
        title: "Renamed note",
        items: [
          { identifier: "old-content", spec: spec("Old") },
          { identifier: "new-content", spec: spec("New") },
        ],
      },
    ],
  };
  const preview = await runIngest({
    ingestible: input,
    configurationPath: fixture.configurationPath,
    dryRun: true,
  });
  const { assignments: previewAssignments, ...previewSummary } = preview;
  assert.deepEqual(previewSummary, {
    dryRun: true,
    mutationCount: 2,
    counts: { ingestTask: 1, updateTaskProvenance: 1 },
  });
  assert.equal(previewAssignments.length, 2);
  assert.deepEqual(previewAssignments[0], {
    sourceIdentifier: "note",
    itemIdentifier: "old-content",
    taskID: "original-task",
  });
  assert.equal(previewAssignments[1].itemIdentifier, "new-content");
  assert.match(previewAssignments[1].taskID, /^[A-Za-z0-9_-]{22}$/);
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const observerRepo = new Repo({ network: [network] });
  await network.whenReady();
  const observer = await PerTaskRepository.open(
    new RepoPerTaskDocuments(observerRepo),
    fixture.rootURL,
  );
  let result;
  try {
    const before = await observer.readLogicalVault();
    assert.equal(Object.keys(before.tasks).length, 1);
    assert.equal(before.tasks["original-task"].provenance.title, "Old note");
    [result] = await Promise.all([
      runIngest({
        ingestible: input,
        configurationPath: fixture.configurationPath,
      }),
      observer.apply([
        {
          kind: "recordReview",
          mutationID: "concurrent-review",
          observationID: "concurrent-review",
          taskID: "original-task",
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: 2000,
        },
      ]),
    ]);
    const deadline = Date.now() + 10000;
    for (;;) {
      const current = await observer.readLogicalVault();
      if (
        Object.keys(current.tasks).length === 2 &&
        current.tasks["original-task"].provenance.title === "Renamed note"
      )
        break;
      if (Date.now() > deadline)
        assert.fail("Independent peer did not receive the ingested tasks");
      await delay(20);
    }
  } finally {
    await observer.close();
    await observerRepo.shutdown();
  }
  assert.equal(result.mutationCount, 2);
  // Change the server between cold importer runs, not just its warm local cache.
  const changeStorage = new AtomicNodeFSStorageAdapter(
    path.join(path.dirname(fixture.configurationPath), "other-client"),
  );
  const otherNetwork = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const otherRepo = new Repo({
    storage: changeStorage,
    network: [otherNetwork],
  });
  await otherNetwork.whenReady();
  const other = await PerTaskRepository.open(
    new RepoPerTaskDocuments(otherRepo),
    fixture.rootURL,
  );
  try {
    await other.apply([
      {
        kind: "updateTaskProvenance",
        mutationID: "remote-title",
        taskID: "original-task",
        provenance: { identifier: "note", title: "Remote title" },
      },
    ]);
    const taskURL = (await other.getCatalogEntries())["original-task"]
      .documentURL;
    const handle = await otherRepo.find(taskURL);
    const deadline = Date.now() + 5000;
    while (
      JSON.stringify(handle.heads().slice().sort()) !==
      JSON.stringify(
        handle
          .getSyncInfo(otherNetwork.remoteStorageID)
          ?.lastHeads.slice()
          .sort(),
      )
    ) {
      if (Date.now() > deadline)
        assert.fail("Remote title did not reach the server");
      await delay(20);
    }
  } finally {
    await other.close();
    await otherRepo.shutdown();
    await changeStorage.close();
  }
  const refreshed = await runIngest({
    ingestible: input,
    configurationPath: fixture.configurationPath,
  });
  assert.deepEqual(refreshed.counts, { updateTaskProvenance: 1 });
  // Each invocation is a new Repo process owner. There is no in-memory importer journal.
  assert.equal(
    (
      await runIngest({
        ingestible: input,
        configurationPath: fixture.configurationPath,
      })
    ).mutationCount,
    0,
  );
  // The external notes wrapper has Bun, but no interactive fnm/Node PATH.
  const inputPath = path.join(
    path.dirname(fixture.configurationPath),
    "input.json",
  );
  await fs.writeFile(inputPath, JSON.stringify(input));
  const bunChild = spawn("bun", [
    fileURLToPath(new URL("../src/bin/run.ts", import.meta.url)),
    inputPath,
    "--config",
    fixture.configurationPath,
  ]);
  let bunOutput = "";
  let bunError = "";
  bunChild.stdout.setEncoding("utf8").on("data", (text) => {
    bunOutput += text;
  });
  bunChild.stderr.setEncoding("utf8").on("data", (text) => {
    bunError += text;
  });
  assert.equal(
    await new Promise((resolve) => bunChild.once("close", resolve)),
    0,
    bunError,
  );
  assert.equal(JSON.parse(bunOutput).mutationCount, 0);
  await fixture.service.shutdown();
  services.splice(services.indexOf(fixture.service), 1);
  // Inspect disk only after the server is quiesced. Its own Repo owns every write.
  const storage = new AtomicNodeFSStorageAdapter(fixture.storageRoot);
  const repo = new Repo({ storage, network: [] });
  const vault = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.rootURL,
  );
  try {
    const logical = await vault.readLogicalVault();
    assert.equal(Object.keys(logical.tasks).length, 2);
    assert.equal(
      logical.tasks["original-task"].provenance?.title,
      "Renamed note",
    );
    assert.deepEqual(Object.keys(logical.observations).sort(), [
      "concurrent-review",
      "original-review",
    ]);
    assert.equal(
      logical.observations["original-review"].taskID,
      "original-task",
    );
  } finally {
    await vault.close();
    await repo.shutdown();
    await storage.close();
  }
});

test("adopting a badge updates the original document and preserves another client's reviews", async () => {
  const taskID = "AbCdEfGhIjKlMnOpQrStUv";
  const fixture = await startFixture(0, taskID);
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const observerRepo = new Repo({ network: [network] });
  await network.whenReady();
  const observer = await PerTaskRepository.open(
    new RepoPerTaskDocuments(observerRepo),
    fixture.rootURL,
  );
  const editedSpec = spec("Edited question");
  editedSpec.content.answer.text = "Edited answer";
  const input = {
    sources: [
      {
        identifier: "moved-note",
        title: "Moved note",
        items: [{ identifier: taskID, taskID, spec: editedSpec }],
      },
    ],
  };
  let originalEntry;
  let observationsBeforeEdit;
  try {
    await observer.apply([
      {
        kind: "recordReview",
        mutationID: "peer-review",
        observationID: "peer-review",
        taskID,
        componentID: "main",
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: 2000,
      },
    ]);
    observationsBeforeEdit = (await observer.readLogicalVault()).observations;
    originalEntry = (await observer.getCatalogEntries())[taskID];
    const handle = await observerRepo.find(originalEntry.documentURL);
    const reviewDeadline = Date.now() + 5000;
    while (
      JSON.stringify(handle.heads().slice().sort()) !==
      JSON.stringify(
        handle.getSyncInfo(network.remoteStorageID)?.lastHeads.slice().sort(),
      )
    ) {
      if (Date.now() > reviewDeadline)
        assert.fail(
          "Peer review did not reach the server before badge adoption",
        );
      await delay(20);
    }
    const result = await runIngest({
      ingestible: input,
      configurationPath: fixture.configurationPath,
    });
    assert.ok(result.mutationCount > 0);
    assert.equal(result.counts.ingestTask, undefined);
    const deadline = Date.now() + 5000;
    for (;;) {
      const logical = await observer.readLogicalVault();
      const task = logical.tasks[taskID];
      if (
        task?.spec.content.body.text === "Edited question" &&
        task.spec.content.answer.text === "Edited answer" &&
        task.provenance?.identifier === "moved-note" &&
        task.metadata.ingestSourceIdentifier === taskID
      ) {
        assert.deepEqual(Object.keys(logical.tasks), [taskID]);
        assert.deepEqual(logical.tasks[taskID].spec, editedSpec);
        assert.deepEqual(logical.tasks[taskID].provenance, {
          identifier: "moved-note",
          title: "Moved note",
        });
        assert.equal(
          logical.tasks[taskID].metadata.ingestSourceIdentifier,
          taskID,
        );
        assert.deepEqual(logical.observations, observationsBeforeEdit);
        const entry = (await observer.getCatalogEntries())[taskID];
        if (
          JSON.stringify(entry.indexedTaskHeads) !==
          JSON.stringify(originalEntry.indexedTaskHeads)
        ) {
          assert.equal(entry.documentURL, originalEntry.documentURL);
          assert.equal(
            entry.nextDueTimestampMillis,
            originalEntry.nextDueTimestampMillis,
          );
          break;
        }
      }
      if (Date.now() > deadline)
        assert.fail(
          "Independent peer did not receive the badge edit and refreshed catalog",
        );
      await delay(20);
    }
  } finally {
    await observer.close();
    await observerRepo.shutdown();
  }
  assert.equal(
    (
      await runIngest({
        ingestible: input,
        configurationPath: fixture.configurationPath,
      })
    ).mutationCount,
    0,
  );
  await fixture.service.shutdown();
  services.splice(services.indexOf(fixture.service), 1);
  const storage = new AtomicNodeFSStorageAdapter(fixture.storageRoot);
  const repo = new Repo({ storage, network: [] });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.rootURL,
  );
  try {
    const logical = await reopened.readLogicalVault();
    assert.deepEqual(Object.keys(logical.tasks), [taskID]);
    assert.deepEqual(logical.tasks[taskID].spec, editedSpec);
    assert.deepEqual(logical.observations, observationsBeforeEdit);
    assert.equal(
      (await reopened.getCatalogEntries())[taskID].documentURL,
      originalEntry.documentURL,
    );
  } finally {
    await reopened.close();
    await repo.shutdown();
    await storage.close();
  }
});

for (const { name, answerSource, answer, finalParagraph } of [
  {
    name: "single-paragraph answer",
    answerSource: "A. A real answer.",
    answer: "A real answer.",
    finalParagraph: "A real answer.",
  },
  {
    name: "multi-paragraph answer before the BearID footer",
    answerSource: "A.\nA real answer.\n\nA second paragraph.",
    answer: "A real answer.\n\nA second paragraph.",
    finalParagraph: "A second paragraph.",
  },
  {
    name: "multiblock answer terminated by two blank lines before unrelated source prose",
    answerSource: "A.\nA real answer.\n\n\nUnrelated source prose.",
    answer: "A real answer.",
    finalParagraph: "A real answer.",
  },
  {
    name: "bullet-list answer immediately after its standalone marker",
    answerSource: "A.\n* A real answer.\n* A second point.",
    answer: "* A real answer.\n* A second point.",
    finalParagraph: "* A second point.",
  },
  {
    name: "numbered-list answer immediately after its standalone marker",
    answerSource: "A.\n1. A real answer.\n2. A second point.",
    answer: "1. A real answer.\n2. A second point.",
    finalParagraph: "2. A second point.",
  },
  {
    name: "quoted answer immediately after its standalone marker",
    answerSource: "A.\n> A real answer.",
    answer: "> A real answer.",
    finalParagraph: "> A real answer.",
  },
]) {
  test(`prepared Markdown imports and updates a ${name} without losing reviews`, async () => {
    const fixture = await startFixture();
    const file = path.join(
      path.dirname(fixture.configurationPath),
      "Round trip.md",
    );
    const bearID = "860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA";
    const footer = `<!-- {BearID:${bearID}} -->\n`;
    const original = `# Badge round trip\n\nIntro **unchanged**.\n\nQ. What survives an edit?\n${answerSource}\n\n${footer}`;
    const editedAnswer = answer.replace(
      "A real answer.",
      "The same task identity.",
    );
    await fs.writeFile(file, original);
    const network = new AuthenticatedWebSocketNetworkAdapter(
      `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
      async () => ({
        kind: "pairedToken",
        token: fixture.service.configuration.pairingToken,
      }),
    );
    const observerRepo = new Repo({ network: [network] });
    await network.whenReady();
    const observer = await PerTaskRepository.open(
      new RepoPerTaskDocuments(observerRepo),
      fixture.rootURL,
    );
    let taskID;
    let documentURL;
    let reviewed;
    let componentStates;
    try {
      const before = await observer.readLogicalVault();
      const preview = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
        dryRun: true,
      });
      assert.equal(preview.mutationCount, 1);
      assert.deepEqual(preview.counts, { ingestTask: 1 });
      assert.equal(await fs.readFile(file, "utf8"), original);
      assert.deepEqual(await observer.readLogicalVault(), before);

      const prepared = await prepareMarkdownStamps({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.equal(prepared.stampedFileCount, 1);
      const stamped = await fs.readFile(file, "utf8");
      taskID = stamped.match(/\[☉\]\(orbit:\/\/task\/([A-Za-z0-9_-]{22})\)/)[1];
      assert.match(taskID, /^[A-Za-z0-9_-]{22}$/);
      assert.equal(
        stamped,
        original.replace(
          finalParagraph,
          `${finalParagraph} [☉](orbit://task/${taskID})`,
        ),
      );
      assert.ok(stamped.endsWith(footer));
      assert.ok(
        stamped.indexOf(`[☉](orbit://task/${taskID})`) <
          stamped.indexOf(footer),
      );
      assert.deepEqual((await readFixture(fixture)).logical, before);
      // This disposable snapshot is now accepted source text. Importing it
      // must not perform another source-writeback step.
      const imported = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.deepEqual(imported.counts, { ingestTask: 1 });
      assert.equal(imported.assignments.length, 1);
      assert.equal(imported.assignments[0].taskID, taskID);
      assert.equal(imported.assignments[0].sourceIdentifier, bearID);
      assert.equal(await fs.readFile(file, "utf8"), stamped);
      const receiveDeadline = Date.now() + 5000;
      while (!(await observer.readLogicalVault()).tasks[taskID]) {
        if (Date.now() > receiveDeadline)
          assert.fail("Independent peer did not receive the stamped task");
        await delay(20);
      }
      const initial = (await observer.readLogicalVault()).tasks[taskID];
      assert.equal(initial.spec.content.body.text, "What survives an edit?");
      assert.equal(initial.spec.content.answer.text, answer);
      assert.equal(
        initial.provenance.url,
        `bear://x-callback-url/open-note?id=${bearID}&search=${taskID}`,
      );
      assert.doesNotMatch(
        initial.spec.content.answer.text,
        /BearID|orbit:\/\/|☉/,
      );
      documentURL = (await observer.getCatalogEntries())[taskID].documentURL;
      await observer.apply([
        {
          kind: "recordReview",
          mutationID: "stamped-review",
          observationID: "stamped-review",
          taskID,
          componentID: "main",
          reviewSessionID: null,
          outcome: TaskRepetitionOutcome.Remembered,
          occurredAtTimestampMillis: Date.now(),
        },
      ]);
      const handle = await observerRepo.find(documentURL);
      const reviewDeadline = Date.now() + 5000;
      while (
        JSON.stringify(handle.heads().slice().sort()) !==
        JSON.stringify(
          handle.getSyncInfo(network.remoteStorageID)?.lastHeads.slice().sort(),
        )
      ) {
        if (Date.now() > reviewDeadline)
          assert.fail(
            "Peer review did not reach the server before the source edit",
          );
        await delay(20);
      }
      reviewed = await observer.readLogicalVault();
      componentStates = (await observer.getTaskProjections([taskID])).tasks.get(
        taskID,
      ).componentStates;
      const edited = stamped
        .replace(
          "What survives an edit?",
          "Which identity survives a wording edit?",
        )
        .replace("A real answer.", "The same task identity.");
      await fs.writeFile(file, edited);
      const updated = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.deepEqual(updated.counts, {
        updateTaskSpec: 1,
      });
      assert.equal(updated.assignments[0].taskID, taskID);
      assert.equal(await fs.readFile(file, "utf8"), edited);
      const editDeadline = Date.now() + 5000;
      for (;;) {
        const logical = await observer.readLogicalVault();
        if (logical.tasks[taskID].spec.content.answer.text === editedAnswer) {
          assert.equal(Object.keys(logical.tasks).length, 2);
          assert.deepEqual(logical.observations, reviewed.observations);
          assert.equal(
            logical.tasks[taskID].createdAtTimestampMillis,
            initial.createdAtTimestampMillis,
          );
          assert.deepEqual(
            (await observer.getTaskProjections([taskID])).tasks.get(taskID)
              .componentStates,
            componentStates,
          );
          break;
        }
        if (Date.now() > editDeadline)
          assert.fail(
            "Independent peer did not receive the in-place source edit",
          );
        await delay(20);
      }
      const repeat = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.equal(repeat.mutationCount, 0);
      assert.equal(repeat.assignments[0].taskID, taskID);
      assert.equal(await fs.readFile(file, "utf8"), edited);
    } finally {
      await observer.close();
      await observerRepo.shutdown();
    }
    await fixture.service.shutdown();
    services.splice(services.indexOf(fixture.service), 1);
    const storage = new AtomicNodeFSStorageAdapter(fixture.storageRoot);
    const repo = new Repo({ storage, network: [] });
    const reopened = await PerTaskRepository.open(
      new RepoPerTaskDocuments(repo),
      fixture.rootURL,
    );
    try {
      const logical = await reopened.readLogicalVault();
      assert.equal(Object.keys(logical.tasks).length, 2);
      assert.equal(
        logical.tasks[taskID].spec.content.body.text,
        "Which identity survives a wording edit?",
      );
      assert.equal(
        logical.tasks[taskID].spec.content.answer.text,
        editedAnswer,
      );
      assert.equal(
        logical.tasks[taskID].provenance.url,
        `bear://x-callback-url/open-note?id=${bearID}&search=${taskID}`,
      );
      assert.deepEqual(logical.observations, reviewed.observations);
      assert.equal(
        logical.tasks[taskID].createdAtTimestampMillis,
        reviewed.tasks[taskID].createdAtTimestampMillis,
      );
      assert.equal(
        (await reopened.getCatalogEntries())[taskID].documentURL,
        documentURL,
      );
      assert.deepEqual(
        (await reopened.getTaskProjections([taskID])).tasks.get(taskID)
          .componentStates,
        componentStates,
      );
    } finally {
      await reopened.close();
      await repo.shutdown();
      await storage.close();
    }
  });
}

test("stable cloze IDs retain reviewed components through membership edits and cold reload", async () => {
  const scheduler = fsrsPolicy();
  const fixture = await startFixture(0, "original-task", { scheduler });
  const file = path.join(path.dirname(fixture.configurationPath), "Cloze.md");
  const bearID = "676B2489-B897-487D-A0CD-F9FD92B229EC";
  const source = (body, badge = "") =>
    `# Editable cloze\n\n${body}${badge ? ` ${badge}` : ""}\n\n<!-- {BearID:${bearID}} -->\n`;
  const original = source("The {alpha} follows {beta}.");
  const input = { paths: [file], configurationPath: fixture.configurationPath };
  await fs.writeFile(file, original);
  const imported = await runMarkdownIngest(input);
  assert.deepEqual(imported.counts, { ingestTask: 1 });
  const taskID = imported.assignments[0].taskID;
  const initial = await readFixture(fixture);
  const documentURL = initial.entries[taskID].documentURL;
  assert.deepEqual(
    Object.keys(initial.logical.tasks[taskID].spec.content.components),
    ["0", "1"],
  );

  const network = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const reviewRepo = new Repo({ network: [network] });
  await network.whenReady();
  const reviewer = await PerTaskRepository.open(
    new RepoPerTaskDocuments(reviewRepo),
    fixture.rootURL,
  );
  const reviewTime = Date.now();
  try {
    await reviewer.apply(
      ["0", "1"].map((componentID, index) => ({
        kind: "recordReview",
        mutationID: `cloze-review-${componentID}`,
        observationID: `cloze-review-${componentID}`,
        taskID,
        componentID,
        reviewSessionID: null,
        outcome: TaskRepetitionOutcome.Remembered,
        occurredAtTimestampMillis: reviewTime + index * 1000,
      })),
    );
    const handle = await reviewRepo.find(documentURL);
    const deadline = Date.now() + 5000;
    while (
      JSON.stringify(handle.heads().slice().sort()) !==
      JSON.stringify(
        handle.getSyncInfo(network.remoteStorageID)?.lastHeads.slice().sort(),
      )
    ) {
      if (Date.now() > deadline)
        assert.fail("Cloze reviews did not reach the server before editing");
      await delay(20);
    }
  } finally {
    await reviewer.close();
    await reviewRepo.shutdown();
  }
  const reviewed = await readFixture(fixture);
  const reviewedStates = reviewed.projected.get(taskID).componentStates;
  for (const componentID of ["0", "1"])
    assert.ok(reviewedStates[componentID].fsrs);

  // First badge adoption must reuse the historical unlabeled task, not create
  // a replacement merely because its component IDs are about to become explicit.
  assert.deepEqual(await prepareMarkdownStamps(input), { stampedFileCount: 1 });
  const badge = `[☉](orbit://task/${taskID})`;
  assert.equal(
    await fs.readFile(file, "utf8"),
    source("The {alpha} follows {beta}.", badge),
  );
  const adopted = await runMarkdownIngest(input);
  assert.deepEqual(adopted.counts, {
    mergeTaskMetadata: 1,
    updateTaskProvenance: 1,
  });
  assert.equal(adopted.assignments[0].taskID, taskID);
  assert.equal(
    (await readFixture(fixture)).logical.tasks[taskID].provenance.url,
    `bear://x-callback-url/open-note?id=${bearID}&search=${taskID}`,
  );
  await fs.writeFile(file, source("The {0::alpha} follows {1::beta}.", badge));
  assert.equal((await runMarkdownIngest(input)).mutationCount, 0);

  const queueTime = reviewTime + 365 * 24 * 60 * 60 * 1000;
  async function edit(body, componentIDs) {
    const accepted = source(body, badge);
    await fs.writeFile(file, accepted);
    const result = await runMarkdownIngest(input);
    assert.deepEqual(result.counts, { updateTaskSpec: 1 });
    assert.equal(result.assignments[0].taskID, taskID);
    assert.equal(await fs.readFile(file, "utf8"), accepted);
    const current = await readFixture(fixture, queueTime);
    assert.deepEqual(
      Object.keys(current.logical.tasks).sort(),
      ["original-task", taskID].sort(),
    );
    assert.equal(current.entries[taskID].documentURL, documentURL);
    assert.equal(
      current.logical.tasks[taskID].provenance.url,
      `bear://x-callback-url/open-note?id=${bearID}&search=${taskID}`,
    );
    assert.deepEqual(
      current.logical.observations,
      reviewed.logical.observations,
    );
    assert.equal(
      current.logical.tasks[taskID].createdAtTimestampMillis,
      initial.logical.tasks[taskID].createdAtTimestampMillis,
    );
    assert.equal(
      current.logical.tasks[taskID].metadata.ingestSourceIdentifier,
      taskID,
    );
    const task = current.projected.get(taskID);
    assert.deepEqual(
      Object.keys(task.spec.content.components).sort(),
      componentIDs.slice().sort(),
    );
    assert.deepEqual(
      Object.keys(task.componentStates).sort(),
      componentIDs.slice().sort(),
    );
    for (const componentID of componentIDs.filter(
      (id) => id === "0" || id === "1",
    ))
      assert.deepEqual(
        task.componentStates[componentID],
        reviewedStates[componentID],
      );
    for (const item of current.queue.filter(({ task }) => task.id === taskID))
      assert.ok(Object.hasOwn(task.spec.content.components, item.componentID));
    return current;
  }

  const added = await edit(
    "The {0::alpha} follows {1::beta} and {__proto__::gamma}.",
    ["0", "1", "__proto__"],
  );
  assert.equal(
    added.logical.tasks[taskID].spec.content.body.text,
    "The alpha follows beta and gamma.",
  );
  const newState = added.projected.get(taskID).componentStates.__proto__;
  assert.ok(
    Object.hasOwn(added.projected.get(taskID).componentStates, "__proto__"),
  );
  assert.equal(newState.lastRepetitionTimestampMillis, null);
  assert.equal(newState.fsrs, undefined);
  const reordered = await edit(
    "The {__proto__::gamma} precedes {1::beta}, then {0::alpha}.",
    ["0", "1", "__proto__"],
  );
  assert.equal(
    reordered.logical.tasks[taskID].spec.content.components.__proto__.order,
    0,
  );
  assert.equal(
    reordered.logical.tasks[taskID].spec.content.components["0"].order,
    2,
  );
  const removed = await edit("The {__proto__::gamma} precedes {1::beta}.", [
    "1",
    "__proto__",
  ]);
  assert.ok(removed.logical.observations["cloze-review-0"]);
  assert.ok(
    removed.queue.every(
      (item) => item.task.id !== taskID || item.componentID !== "0",
    ),
  );
  const restored = await edit(
    "The {0::alpha} returns after {__proto__::gamma} and {1::beta}.",
    ["0", "1", "__proto__"],
  );
  assert.equal(
    restored.logical.tasks[taskID].spec.content.body.text,
    "The alpha returns after gamma and beta.",
  );
  assert.deepEqual(
    restored.projected.get(taskID).componentStates.__proto__,
    newState,
  );
  const accepted = await fs.readFile(file, "utf8");
  await fs.writeFile(
    file,
    source("The {0::alpha} collides with {0::beta}.", badge),
  );
  await assert.rejects(runMarkdownIngest(input), /used more than once/);
  assert.deepEqual(await readFixture(fixture, queueTime), restored);
  await fs.writeFile(file, accepted);
  assert.equal((await runMarkdownIngest(input)).mutationCount, 0);

  await fixture.service.shutdown();
  services.splice(services.indexOf(fixture.service), 1);
  const storage = new AtomicNodeFSStorageAdapter(fixture.storageRoot);
  const repo = new Repo({ storage, network: [] });
  const reopened = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.rootURL,
  );
  try {
    assert.deepEqual(await reopened.readLogicalVault(), restored.logical);
    assert.equal(
      (await reopened.getCatalogEntries())[taskID].documentURL,
      documentURL,
    );
    assert.deepEqual(
      (await reopened.getTaskProjections([taskID])).tasks.get(taskID)
        .componentStates,
      restored.projected.get(taskID).componentStates,
    );
  } finally {
    await reopened.close();
    await repo.shutdown();
    await storage.close();
  }
});

test("directory ingestion reads immediate regular Markdown without changing sources", async () => {
  const fixture = await startFixture();
  const directory = path.dirname(fixture.configurationPath);
  const notes = path.join(directory, "notes");
  await fs.mkdir(notes);
  const firstID = "C4B1329B-741C-42D4-A04D-CA36EC3F3B0B";
  const secondID = "3B7765AD-6FB2-4E3A-A9F1-670A695BDA83";
  const firstFile = path.join(notes, "First.md");
  const secondFile = path.join(notes, "Second.md");
  const first = `# First note\n\nQ. Which note comes first?\nA. This one.\n\n<!-- {BearID:${firstID}} -->\n`;
  const second = `# Second note\n\nQ. Which note comes second?\nA. This other one.\n\n<!-- {BearID:${secondID}} -->\n`;
  await fs.writeFile(firstFile, first);
  await fs.writeFile(secondFile, second);
  const invalid =
    "Q. This file must not be parsed.\nA. Invalid badge [☉](orbit://task/not-valid)\n";
  const nested = path.join(notes, "nested");
  await fs.mkdir(nested);
  const ignoredFiles = [
    path.join(notes, ".Hidden.md"),
    path.join(notes, "Other.txt"),
    path.join(nested, "Nested.md"),
    path.join(directory, "Outside.md"),
  ];
  await Promise.all(ignoredFiles.map((file) => fs.writeFile(file, invalid)));
  await fs.symlink(ignoredFiles[3], path.join(notes, "Linked.md"));

  const input = {
    directory: notes,
    configurationPath: fixture.configurationPath,
  };
  const imported = await runMarkdownIngest(input);
  assert.deepEqual(imported.counts, { ingestTask: 2 });
  assert.equal(imported.assignments.length, 2);
  const assigned = new Map(
    imported.assignments.map(({ sourceIdentifier, taskID }) => [
      sourceIdentifier,
      taskID,
    ]),
  );
  assert.match(assigned.get(firstID), /^[A-Za-z0-9_-]{22}$/);
  assert.match(assigned.get(secondID), /^[A-Za-z0-9_-]{22}$/);
  assert.notEqual(assigned.get(firstID), assigned.get(secondID));
  assert.equal(await fs.readFile(firstFile, "utf8"), first);
  assert.equal(await fs.readFile(secondFile, "utf8"), second);
  const accepted = await readFixture(fixture);
  assert.equal(Object.keys(accepted.logical.tasks).length, 3);
  assert.equal(
    accepted.logical.tasks[assigned.get(firstID)].spec.content.answer.text,
    "This one.",
  );
  assert.equal(
    accepted.logical.tasks[assigned.get(secondID)].spec.content.answer.text,
    "This other one.",
  );
  const repeat = await runMarkdownIngest(input);
  assert.equal(repeat.mutationCount, 0);
  assert.deepEqual(
    new Map(
      repeat.assignments.map(({ sourceIdentifier, taskID }) => [
        sourceIdentifier,
        taskID,
      ]),
    ),
    assigned,
  );
  assert.equal(await fs.readFile(firstFile, "utf8"), first);
  assert.equal(await fs.readFile(secondFile, "utf8"), second);
  for (const file of ignoredFiles)
    assert.equal(await fs.readFile(file, "utf8"), invalid);
});

for (const rejectedSave of [false, true]) {
  test(
    rejectedSave
      ? "rejected source saves leave no provisional tasks before a newer snapshot is accepted"
      : "preparing badges reuses reviewed task IDs without applying vault changes",
    async () => {
      const oldTaskID = "AbCdEfGhIjKlMnOpQrStUv";
      const oldSourceID = "3B7B67AA-557E-4229-88C7-FC3029B56AB3";
      const newSourceID = "65144798-E0AC-41BE-A5FD-3DC0E11AEF8A";
      const scheduler = fsrsPolicy();
      const fixture = await startFixture(0, oldTaskID, {
        scheduler,
        itemIdentifier: hashTaskSpec(spec("Old")),
        provenance: {
          identifier: oldSourceID,
          title: "Old note",
          url: `bear://x-callback-url/open-note?id=${oldSourceID}`,
        },
      });
      const notes = path.join(
        path.dirname(fixture.configurationPath),
        "source",
      );
      await fs.mkdir(notes);
      const oldFile = path.join(notes, "Old.md");
      const newFile = path.join(notes, "New.md");
      const oldBadge = `[☉](orbit://task/${oldTaskID})`;
      // The rejected-save case already has an accepted stable badge; the other
      // case exercises first adoption by matching historical content metadata.
      const oldSource = `# Old note\n\nQ. Old\nA. Answer${rejectedSave ? ` ${oldBadge}` : ""}\n\n<!-- {BearID:${oldSourceID}} -->\n`;
      const newSource = `# New note\n\nQ. A new question?\nA. A new answer.\n\n<!-- {BearID:${newSourceID}} -->\n`;
      await fs.writeFile(oldFile, oldSource);
      await fs.writeFile(newFile, newSource);
      const input = {
        directory: notes,
        configurationPath: fixture.configurationPath,
      };
      const before = await readFixture(fixture);
      assert.ok(before.projected.get(oldTaskID).componentStates.main.fsrs);
      assert.deepEqual(await prepareMarkdownStamps(input), {
        stampedFileCount: rejectedSave ? 1 : 2,
      });
      const preparedOld = await fs.readFile(oldFile, "utf8");
      assert.equal(
        preparedOld,
        rejectedSave
          ? oldSource
          : oldSource.replace("A. Answer", `A. Answer ${oldBadge}`),
      );
      const badgePattern = /\[☉\]\(orbit:\/\/task\/([A-Za-z0-9_-]{22})\)/;
      const attemptedID = (await fs.readFile(newFile, "utf8")).match(
        badgePattern,
      )[1];
      assert.notEqual(attemptedID, oldTaskID);
      // A fresh independent peer cannot inherit a stale pre-prepare snapshot.
      assert.deepEqual(await readFixture(fixture), before);

      let acceptedID = attemptedID;
      if (rejectedSave) {
        // Model the native source rejecting this temporary export: nothing from
        // that generated snapshot is accepted, including its provisional ID.
        await fs.rm(notes, { recursive: true });
        await fs.mkdir(notes);
        await fs.writeFile(oldFile, oldSource);
        await fs.writeFile(
          newFile,
          newSource.replace("A new question?", "A newer question?"),
        );
        assert.deepEqual(await prepareMarkdownStamps(input), {
          stampedFileCount: 1,
        });
        acceptedID = (await fs.readFile(newFile, "utf8")).match(
          badgePattern,
        )[1];
        assert.notEqual(acceptedID, attemptedID);
        assert.equal(await fs.readFile(oldFile, "utf8"), oldSource);
        assert.deepEqual(await readFixture(fixture), before);
      }
      assert.deepEqual(await prepareMarkdownStamps(input), {
        stampedFileCount: 0,
      });
      const acceptedSources = await Promise.all(
        [oldFile, newFile].map((file) => fs.readFile(file, "utf8")),
      );
      const imported = await runMarkdownIngest(input);
      assert.deepEqual(imported.counts, {
        ingestTask: 1,
        mergeTaskMetadata: 1,
        updateTaskProvenance: 1,
      });
      assert.deepEqual(
        await Promise.all(
          [oldFile, newFile].map((file) => fs.readFile(file, "utf8")),
        ),
        acceptedSources,
      );
      const accepted = await readFixture(fixture);
      assert.deepEqual(
        Object.keys(accepted.logical.tasks).sort(),
        [oldTaskID, acceptedID].sort(),
      );
      for (const [taskID, sourceID] of [
        [oldTaskID, oldSourceID],
        [acceptedID, newSourceID],
      ])
        assert.equal(
          accepted.logical.tasks[taskID].provenance.url,
          `bear://x-callback-url/open-note?id=${sourceID}&search=${taskID}`,
        );
      if (rejectedSave)
        assert.equal(accepted.logical.tasks[attemptedID], undefined);
      assert.equal(
        accepted.logical.tasks[acceptedID].spec.content.body.text,
        rejectedSave ? "A newer question?" : "A new question?",
      );
      assert.equal(
        accepted.logical.tasks[oldTaskID].metadata.ingestSourceIdentifier,
        oldTaskID,
      );
      assert.deepEqual(
        accepted.logical.tasks[oldTaskID].spec,
        before.logical.tasks[oldTaskID].spec,
      );
      assert.equal(
        accepted.logical.tasks[oldTaskID].createdAtTimestampMillis,
        before.logical.tasks[oldTaskID].createdAtTimestampMillis,
      );
      assert.deepEqual(
        accepted.logical.observations,
        before.logical.observations,
      );
      assert.equal(
        accepted.entries[oldTaskID].documentURL,
        before.entries[oldTaskID].documentURL,
      );
      assert.deepEqual(
        accepted.projected.get(oldTaskID).componentStates,
        before.projected.get(oldTaskID).componentStates,
      );
      assert.deepEqual(await prepareMarkdownStamps(input), {
        stampedFileCount: 0,
      });
      const repeat = await runMarkdownIngest(input);
      assert.equal(repeat.mutationCount, 0);
      assert.deepEqual(
        await Promise.all(
          [oldFile, newFile].map((file) => fs.readFile(file, "utf8")),
        ),
        acceptedSources,
      );
    },
  );
}

test("CLI input and authentication failures exit nonzero without leaking the pairing token", async () => {
  const fixture = await startFixture();
  const directory = path.dirname(fixture.configurationPath);
  const input = path.join(directory, "input.json");
  const command = fileURLToPath(new URL("../dist/bin/run.js", import.meta.url));
  await fs.writeFile(input, '{"notSources":[]}');
  const invalid = spawnSync(process.execPath, [command, input], {
    encoding: "utf8",
  });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Invalid ingestible JSON/);
  await fs.writeFile(input, '{"sources":[]}');
  const configuration = JSON.parse(
    await fs.readFile(fixture.configurationPath, "utf8"),
  );
  configuration.pairingToken = "wrong-private-fixture-token-0123456789";
  await fs.writeFile(fixture.configurationPath, JSON.stringify(configuration));
  const child = spawn(process.execPath, [
    command,
    input,
    "--config",
    fixture.configurationPath,
  ]);
  let stderr = "";
  child.stderr.setEncoding("utf8").on("data", (text) => {
    stderr += text;
  });
  const exit = await new Promise((resolve) => child.once("close", resolve));
  assert.equal(exit, 1);
  assert.match(stderr, /bootstrap failed \(401\)/);
  assert.ok(!stderr.includes(configuration.pairingToken));
});

nodeTest(
  "a paired but silent server cannot leave document lookup hanging",
  { timeout: 45000 },
  async () => {
    const directory = await temporaryDirectory();
    const rootDocumentURL = generateAutomergeUrl();
    const token = "silent-fixture-paired-token-0123456789";
    const http = createServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ rootDocumentURL }));
    });
    const sockets = new WebSocketServer({ noServer: true });
    http.on("upgrade", (request, socket, head) => {
      sockets.handleUpgrade(request, socket, head, (peer) => {
        peer.on("message", (data, binary) => {
          if (!binary) {
            peer.send(
              JSON.stringify({
                type: "orbit-sync-admission-accepted",
                protocolVersion: 1,
              }),
            );
          } else if (cbor.decode(data).type === "join") {
            peer.send(
              cbor.encode({
                type: "peer",
                senderId: "silent-fixture",
                selectedProtocolVersion: "1",
                peerMetadata: {
                  storageId: "silent-fixture-storage",
                  isEphemeral: false,
                },
              }),
            );
          }
          // Valid admission, but intentionally never answer document requests.
        });
      });
    });
    await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
    services.push({
      shutdown: async () => {
        for (const socket of sockets.clients) socket.terminate();
        sockets.close();
        await new Promise((resolve) => http.close(resolve));
      },
    });
    const configurationPath = path.join(directory, "config.json");
    await fs.writeFile(
      configurationPath,
      JSON.stringify({
        rootDocumentURL,
        pairingToken: token,
        storageRoot: path.join(directory, "unused-server"),
        port: http.address().port,
      }),
    );
    const input = path.join(directory, "input.json");
    await fs.writeFile(input, '{"sources":[]}');
    const child = spawn(process.execPath, [
      fileURLToPath(new URL("../dist/bin/run.js", import.meta.url)),
      input,
      "--config",
      configurationPath,
    ]);
    let stderr = "";
    child.stderr.setEncoding("utf8").on("data", (text) => {
      stderr += text;
    });
    assert.equal(
      await new Promise((resolve) => child.once("close", resolve)),
      1,
    );
    assert.match(stderr, /timeout|timed out/i);
    const release = await acquireWriterLock(
      path.join(directory, "ingester-repo"),
    );
    await release();
    assert.equal(sockets.clients.size, 0);
  },
);

test("a multi-batch inventory can be released and reopened on a cold repeat", async () => {
  const fixture = await startFixture(130);
  for (let i = 0; i < 2; i++) {
    const result = await runIngest({
      ingestible: { sources: [] },
      configurationPath: fixture.configurationPath,
    });
    assert.equal(result.mutationCount, 0);
  }
});

async function startFixture(
  extraTaskCount = 0,
  taskID = "original-task",
  seed = {},
) {
  const directory = await temporaryDirectory();
  const storageRoot = path.join(directory, "server");
  const seedStorage = new AtomicNodeFSStorageAdapter(storageRoot);
  const seedRepo = new Repo({ storage: seedStorage, network: [] });
  const vault = await PerTaskRepository.create(
    new RepoPerTaskDocuments(seedRepo),
    {
      vaultID: "ingest-fixture",
      createdAtTimestampMillis: Date.now(),
      scheduler: seed.scheduler ?? defaultOrbitSchedulerPolicy,
      tasks: {},
      observations: {},
      attachments: {},
    },
  );
  await vault.apply([
    {
      kind: "ingestTask",
      mutationID: "seed",
      task: {
        taskID,
        createdAtTimestampMillis: 0,
        spec: spec("Old"),
        provenance: seed.provenance ?? {
          identifier: "note",
          title: "Old note",
        },
        metadata: {
          ingestSourceIdentifier: seed.itemIdentifier ?? "old-content",
        },
      },
    },
    {
      kind: "recordReview",
      mutationID: "original-review",
      observationID: "original-review",
      taskID,
      componentID: "main",
      reviewSessionID: null,
      outcome: TaskRepetitionOutcome.Remembered,
      occurredAtTimestampMillis: 1000,
    },
  ]);
  await vault.apply(
    Array.from({ length: extraTaskCount }, (_, i) => ({
      kind: "ingestTask",
      mutationID: `inventory-${i}`,
      task: {
        taskID: `inventory-${i}`,
        createdAtTimestampMillis: 0,
        spec: spec(`Inventory ${i}`),
        provenance: null,
      },
    })),
  );
  const rootURL = vault.rootURL;
  await vault.close();
  await seedRepo.shutdown();
  await seedStorage.close();
  const configuration = {
    storageRoot,
    rootDocumentURL: rootURL,
    pairingToken: "paired-ingester-fixture-token-0123456789",
    updatesRoot: path.join(directory, "updates"),
    port: 0,
    allowedOrigins: new Set(),
  };
  const service = new LabSyncService(configuration);
  const address = await service.start();
  service.configuration.port = address.port;
  services.push(service);
  const configurationPath = path.join(directory, "config.json");
  await fs.writeFile(
    configurationPath,
    JSON.stringify({
      ...configuration,
      port: address.port,
      allowedOrigins: [],
    }),
  );
  return { service, configurationPath, storageRoot, rootURL };
}

async function readFixture(fixture, queueTime) {
  const network = new AuthenticatedWebSocketNetworkAdapter(
    `ws://127.0.0.1:${fixture.service.configuration.port}/v1/sync`,
    async () => ({
      kind: "pairedToken",
      token: fixture.service.configuration.pairingToken,
    }),
  );
  const repo = new Repo({ network: [network] });
  await network.whenReady();
  const repository = await PerTaskRepository.open(
    new RepoPerTaskDocuments(repo),
    fixture.rootURL,
  );
  try {
    const logical = await repository.readLogicalVault();
    return {
      logical,
      entries: await repository.getCatalogEntries(),
      projected: (
        await repository.getTaskProjections(Object.keys(logical.tasks))
      ).tasks,
      ...(queueTime === undefined
        ? {}
        : { queue: await repository.getReviewQueue(queueTime) }),
    };
  } finally {
    await repository.close();
    await repo.shutdown();
  }
}

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "orbit-ingester-test-"),
  );
  directories.push(directory);
  return directory;
}

function spec(question) {
  return {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: question, attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  };
}

function fsrsPolicy() {
  return {
    kind: "fsrs",
    version: 1,
    modelVersion: 6,
    weights: [
      0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
      0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
      0.0912, 0.0658, 0.1542,
    ],
    requestedRetention: 0.9,
    cutoverTimestampMillis: 0,
    previousPolicy: defaultOrbitSchedulerPolicy,
  };
}
