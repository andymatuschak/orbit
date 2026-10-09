import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadReminderConfiguration } from "./reminderConfiguration.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

test("mail configuration needs no enrollment cohort", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "orbit-mail-config-"));
  directories.push(directory);
  const filename = path.join(directory, "reminders.json");
  const configuration = {
    apiKey: "test-key",
    secretKey: "test-secret",
    publicOrigin: "https://sync.example.test",
  };
  await writeFile(filename, JSON.stringify(configuration));
  expect(
    await loadReminderConfiguration({ ORBIT_REMINDER_CONFIG_FILE: filename }),
  ).toEqual(configuration);
});

test("missing or invalid mail configuration remains explicit", async () => {
  expect(await loadReminderConfiguration({})).toBeNull();
  const directory = await mkdtemp(path.join(os.tmpdir(), "orbit-mail-config-"));
  directories.push(directory);
  const filename = path.join(directory, "reminders.json");
  await writeFile(filename, "not JSON");
  await expect(
    loadReminderConfiguration({ ORBIT_REMINDER_CONFIG_FILE: filename }),
  ).rejects.toThrow("Invalid reminder configuration JSON");
});
