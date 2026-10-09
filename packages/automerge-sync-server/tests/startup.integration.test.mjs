import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { PerTaskRepository } from "../../store-shared/dist/perTaskRepository.js";
import { RepoPerTaskDocuments } from "../../store-automerge/dist/index.js";
import {
  AccountRepoPool,
  configurationFromEnvironment,
} from "../dist/index.js";
import { ReminderIndex } from "../dist/notifications/reminderIndex.js";

test("ordinary startup resumes enrolled reminders without enrollment or Firestore access", async (t) => {
  const directory = await temporaryDirectory(t);
  const now = Date.now();
  const pool = new AccountRepoPool(
    configurationFromEnvironment({ ORBIT_SYNC_STORAGE_ROOT: directory }),
  );
  let rootURL;
  try {
    await pool.withRepo("enrolled-vault", async (repo) => {
      const vault = await PerTaskRepository.createEmpty(
        new RepoPerTaskDocuments(repo),
        { vaultID: "enrolled-vault", createdAtTimestampMillis: now },
      );
      rootURL = vault.rootURL;
      await vault.setNotificationPreferences({
        enabled: false,
        snoozedUntilTimestampMillis: null,
        localTimeMinutes: 480,
        timeZone: "America/Los_Angeles",
      });
      await vault.close();
    });
  } finally {
    await pool.shutdown();
  }
  const filename = path.join(directory, "reminders.sqlite");
  const index = new ReminderIndex(filename);
  index.register({
    authSubject: "already-enrolled",
    accountID: "enrolled-vault",
    rootDocumentURL: rootURL,
    emailAddress: "reader@example.test",
    nextEvaluation: now,
  });
  index.recordAttempt("already-enrolled", "2026-10-01", now);
  index.secret(() => "existing-settings-link-key");
  index.close();
  const process = await startProcess(t, directory, {
    apiKey: "test-key",
    secretKey: "test-secret",
    publicOrigin: "https://sync.example.test",
    // An obsolete secret cohort must neither enroll this name nor constrain
    // the durable index's existing cohort.
    subjects: ["never-provisioned"],
  });
  assert.deepEqual(await (await fetch(`${process.origin}/_ready`)).json(), {
    ready: true,
  });
  await until(() => {
    const reopened = new ReminderIndex(filename);
    try {
      const rows = reopened.due(now + 2 * 86400000);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].authSubject, "already-enrolled");
      assert.equal(rows[0].rootDocumentURL, rootURL);
      assert.equal(rows[0].lastAttemptDate, "2026-10-01");
      assert.equal(rows[0].attemptCount, 1);
      assert.equal(
        reopened.secret(() => "wrong"),
        "existing-settings-link-key",
      );
      return rows[0].nextEvaluation > now;
    } finally {
      reopened.close();
    }
  });
  assert.ok(!process.output().includes("reminder_enrolled"));
  assert.ok(!process.output().includes("reminder_evaluation_failed"));
});

test("mail configuration failure is visible but does not prevent sync startup", async (t) => {
  const directory = await temporaryDirectory(t);
  const process = await startProcess(t, directory, "invalid JSON");
  assert.deepEqual(await (await fetch(`${process.origin}/_health`)).json(), {
    healthy: true,
  });
  assert.match(process.output(), /"event":"reminders_unavailable"/);
  assert.equal(
    (await fetch(`${process.origin}/notifications`)).status,
    404,
    "disabled reminders do not pretend the action endpoint is available",
  );
});

test("explicit enrollment requires stopped-writer confirmation and configured mail", async (t) => {
  const directory = await temporaryDirectory(t);
  const storageRoot = path.join(directory, "not-opened");
  for (const args of [
    ["--enroll-reminders", "reader"],
    ["--enroll-reminders", "reader", "--confirm-server-stopped"],
  ]) {
    const child = spawn(process.execPath, ["dist/index.js", ...args], {
      cwd: packageDirectory,
      env: environment(storageRoot, 8787),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    const [code] = await once(child, "exit");
    assert.notEqual(code, 0);
    assert.match(output, /Expected --enroll-reminders|configuration required/);
    await assert.rejects(readFile(path.join(storageRoot, "reminders.sqlite")));
  }
});

test("reminder index corruption remains a startup failure rather than disabling durability", async (t) => {
  const directory = await temporaryDirectory(t);
  const configFile = path.join(directory, "mail.json");
  await writeFile(
    configFile,
    JSON.stringify({
      apiKey: "test-key",
      secretKey: "test-secret",
      publicOrigin: "https://sync.example.test",
    }),
  );
  await writeFile(path.join(directory, "reminders.sqlite"), "corrupt database");
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: packageDirectory,
    env: {
      ...environment(directory, 8787),
      ORBIT_REMINDER_CONFIG_FILE: configFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(child, "exit");
  assert.notEqual(code, 0);
  assert.match(output, /not a database/);
  assert.ok(!output.includes("reminders_unavailable"));
  assert.ok(!output.includes("hosted_sync_started"));
});

const packageDirectory = path.resolve(import.meta.dirname, "..");

async function temporaryDirectory(t) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-sync-startup-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function environment(storageRoot, port) {
  return {
    ...process.env,
    GOOGLE_CLOUD_PROJECT: "test-startup-no-network",
    GCLOUD_PROJECT: "test-startup-no-network",
    GOOGLE_APPLICATION_CREDENTIALS: path.join(storageRoot, "no-credentials"),
    FIRESTORE_EMULATOR_HOST: "127.0.0.1:1",
    ORBIT_SYNC_STORAGE_ROOT: storageRoot,
    ORBIT_REMINDER_CONFIG_FILE: "",
    ORBIT_REMINDER_SECRET: "",
    HOST: "127.0.0.1",
    PORT: String(port),
  };
}

async function startProcess(t, storageRoot, configuration) {
  const configFile = path.join(storageRoot, "mail.json");
  await writeFile(
    configFile,
    typeof configuration === "string"
      ? configuration
      : JSON.stringify(configuration),
  );
  const port = await availablePort();
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: packageDirectory,
    env: {
      ...environment(storageRoot, port),
      ORBIT_REMINDER_CONFIG_FILE: configFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  t.after(async () => {
    if (child.exitCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
    assert.equal(child.exitCode, 0, output);
  });
  await until(() => {
    assert.equal(child.exitCode, null, output);
    return output.includes('"event":"hosted_sync_started"');
  });
  return { origin: `http://127.0.0.1:${port}`, output: () => output };
}

async function availablePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function until(condition) {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Startup assertion timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
