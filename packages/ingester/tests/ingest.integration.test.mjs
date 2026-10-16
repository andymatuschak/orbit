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
  TaskContentType,
  TaskSpecType,
  TaskRepetitionOutcome,
} from "@withorbit/core";
import { runIngest } from "../dist/bin/run.js";
import { runMarkdownIngest } from "../../interpreter/dist/bin/ingest.js";

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
]) {
  test(`Markdown ingestion stamps and updates a ${name} without losing reviews`, async () => {
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
      assert.equal(preview.stampedFileCount, 0);
      assert.equal(await fs.readFile(file, "utf8"), original);
      assert.deepEqual(await observer.readLogicalVault(), before);

      const imported = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.deepEqual(imported.counts, { ingestTask: 1 });
      assert.equal(imported.stampedFileCount, 1);
      assert.equal(imported.assignments.length, 1);
      ({ taskID } = imported.assignments[0]);
      assert.match(taskID, /^[A-Za-z0-9_-]{22}$/);
      assert.equal(imported.assignments[0].sourceIdentifier, bearID);
      const stamped = original.replace(
        finalParagraph,
        `${finalParagraph} [☉](orbit://task/${taskID})`,
      );
      assert.equal(await fs.readFile(file, "utf8"), stamped);
      assert.ok(stamped.endsWith(footer));
      assert.ok(
        stamped.indexOf(`[☉](orbit://task/${taskID})`) <
          stamped.indexOf(footer),
      );
      const receiveDeadline = Date.now() + 5000;
      while (!(await observer.readLogicalVault()).tasks[taskID]) {
        if (Date.now() > receiveDeadline)
          assert.fail("Independent peer did not receive the stamped task");
        await delay(20);
      }
      const initial = (await observer.readLogicalVault()).tasks[taskID];
      assert.equal(initial.spec.content.body.text, "What survives an edit?");
      assert.equal(initial.spec.content.answer.text, answer);
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
        mergeTaskMetadata: 1,
      });
      assert.equal(updated.stampedFileCount, 0);
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
      assert.equal(repeat.stampedFileCount, 0);
      assert.equal(repeat.assignments[0].taskID, taskID);
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

for (const failure of [
  "unwritable source directory",
  "source edited during import",
]) {
  test(`interrupted Markdown stamping is retryable after ${failure}`, async (t) => {
    if (failure === "unwritable source directory" && process.getuid?.() === 0)
      return t.skip("Root bypasses directory write permissions");
    const fixture = await startFixture();
    const notes = path.join(path.dirname(fixture.configurationPath), "notes");
    await fs.mkdir(notes);
    const file = path.join(notes, "Interrupted.md");
    const original =
      "# Interrupted stamping\n\nOriginal introduction.\n\nQ. What survives a retry?\nA. The same task.\n";
    const edited = original.replace(
      "Original introduction.",
      "Introduction edited while the importer was running.",
    );
    const expectedSource =
      failure === "source edited during import" ? edited : original;
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
    try {
      let fetchMock;
      let editedDuringBootstrap = false;
      if (failure === "unwritable source directory") {
        // The importer's cache remains writable; only source staging must fail.
        await fs.chmod(notes, 0o555);
      } else {
        const realFetch = globalThis.fetch.bind(globalThis);
        const bootstrap = `http://127.0.0.1:${fixture.service.configuration.port}/v1/root`;
        fetchMock = t.mock.method(globalThis, "fetch", async (...args) => {
          if (String(args[0]) === bootstrap && !editedDuringBootstrap) {
            // Parsing has finished, but all networking and Repo writes still
            // use the real service. No timing sleep or application hook.
            await fs.writeFile(file, edited);
            editedDuringBootstrap = true;
          }
          return realFetch(...args);
        });
      }
      try {
        await assert.rejects(
          runMarkdownIngest({
            paths: [file],
            configurationPath: fixture.configurationPath,
          }),
          (error) => {
            assert.match(error.message, /vault import synced.*stamping/i);
            if (failure === "unwritable source directory")
              assert.equal(error.cause?.code, "EACCES");
            else
              assert.match(
                error.cause?.message,
                /Markdown changed during ingestion/,
              );
            return true;
          },
        );
      } finally {
        fetchMock?.mock.restore();
        await fs.chmod(notes, 0o755);
      }
      if (failure === "source edited during import")
        assert.equal(editedDuringBootstrap, true);
      assert.equal(await fs.readFile(file, "utf8"), expectedSource);
      assert.deepEqual(await fs.readdir(notes), ["Interrupted.md"]);

      let accepted;
      const deadline = Date.now() + 5000;
      for (;;) {
        accepted = await observer.readLogicalVault();
        if (Object.keys(accepted.tasks).length === 2) break;
        if (Date.now() > deadline)
          assert.fail("Failed source write did not leave an accepted task");
        await delay(20);
      }
      const taskID = Object.keys(accepted.tasks).find(
        (id) => id !== "original-task",
      );
      assert.match(taskID, /^[A-Za-z0-9_-]{22}$/);
      assert.equal(
        accepted.tasks[taskID].spec.content.body.text,
        "What survives a retry?",
      );
      assert.equal(
        accepted.tasks[taskID].spec.content.answer.text,
        "The same task.",
      );
      const documentURL = (await observer.getCatalogEntries())[taskID]
        .documentURL;
      const retry = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.equal(retry.mutationCount, 0);
      assert.equal(retry.stampedFileCount, 1);
      assert.equal(retry.assignments[0].taskID, taskID);
      const stamped = expectedSource.replace(
        "The same task.",
        `The same task. [☉](orbit://task/${taskID})`,
      );
      assert.equal(await fs.readFile(file, "utf8"), stamped);
      const adoption = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.deepEqual(adoption.counts, { mergeTaskMetadata: 1 });
      assert.equal(adoption.assignments[0].taskID, taskID);
      assert.equal(adoption.stampedFileCount, 0);
      const repeat = await runMarkdownIngest({
        paths: [file],
        configurationPath: fixture.configurationPath,
      });
      assert.equal(repeat.mutationCount, 0);
      assert.equal(repeat.stampedFileCount, 0);
      assert.equal(repeat.assignments[0].taskID, taskID);
      assert.equal(await fs.readFile(file, "utf8"), stamped);
      assert.equal(
        (await observer.getCatalogEntries())[taskID].documentURL,
        documentURL,
      );
      assert.deepEqual(
        (await observer.readLogicalVault()).observations,
        accepted.observations,
      );
    } finally {
      await observer.close();
      await observerRepo.shutdown();
    }
  });
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

async function startFixture(extraTaskCount = 0, taskID = "original-task") {
  const directory = await temporaryDirectory();
  const storageRoot = path.join(directory, "server");
  const seedStorage = new AtomicNodeFSStorageAdapter(storageRoot);
  const seedRepo = new Repo({ storage: seedStorage, network: [] });
  const vault = await PerTaskRepository.createEmpty(
    new RepoPerTaskDocuments(seedRepo),
    { vaultID: "ingest-fixture" },
  );
  await vault.apply([
    {
      kind: "ingestTask",
      mutationID: "seed",
      task: {
        taskID,
        createdAtTimestampMillis: 0,
        spec: spec("Old"),
        provenance: { identifier: "note", title: "Old note" },
        metadata: { ingestSourceIdentifier: "old-content" },
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
