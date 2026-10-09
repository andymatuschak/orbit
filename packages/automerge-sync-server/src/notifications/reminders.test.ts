import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  decodeNotificationPreferences,
  type NotificationPreferences,
} from "@withorbit/core";
import { MemorySafeLogger } from "../logging/safeLogger.js";
import { ReminderIndex } from "./reminderIndex.js";
import { ReminderLoop } from "./reminderLoop.js";
import {
  ReminderActionTokens,
  applyReminderAction,
} from "./reminderActions.js";
import {
  localReminderTime,
  nextReminderEvaluation,
  reminderBackoffAllowsAttempt,
} from "./reminderSchedule.js";
import { createReminderDelivery } from "./mailjetDelivery.js";

const day = 24 * 60 * 60_000;
const now = Date.parse("2026-10-01T16:00:00Z"); // 09:00 PDT
const preferences: NotificationPreferences = {
  enabled: true,
  timeZone: "America/Los_Angeles",
  localTimeMinutes: 480,
  snoozedUntilTimestampMillis: null,
};
const account = {
  authSubject: "reader",
  accountID: "vault",
  rootDocumentURL: "automerge:root",
  emailAddress: "reader@example.test",
  nextEvaluation: now,
};
const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function fixture(
  overrides: Partial<ConstructorParameters<typeof ReminderLoop>[1]> = {},
) {
  const index = new ReminderIndex(":memory:");
  cleanups.push(() => index.close());
  index.register(account);
  let sends = 0,
    reads = 0;
  const loop = new ReminderLoop(index, {
    preferences: async () => preferences,
    catalog: async () => {
      reads++;
      return { due: 10, fingerprint: "stable" };
    },
    send: async () => {
      sends++;
      expect(index.due(now)).toHaveLength(0);
    },
    logger: new MemorySafeLogger(),
    ...overrides,
  });
  return { index, loop, sends: () => sends, reads: () => reads };
}

describe("single-host vault reminders", () => {
  test("attempts at most once per local date and skips the next day", async () => {
    const f = fixture();
    await f.loop.tick(now);
    await f.loop.tick(now + 1000);
    expect(f.sends()).toBe(1);
    f.index.schedule(account.authSubject, now); // settings/duplicate wake
    await f.loop.tick(now);
    expect(f.sends()).toBe(1);
    await f.loop.tick(now + day);
    expect(f.sends()).toBe(1);
    await f.loop.tick(now + 2 * day);
    expect(f.sends()).toBe(2);
  });

  test("follows 2/2/5/10/20/30-day gaps, then stops despite newly due tasks", async () => {
    const dates: string[] = [];
    let fingerprint = "stable";
    const f = fixture({
      catalog: async (_account, time) => ({
        due: 10 + Math.floor((time - now) / day),
        fingerprint,
      }),
      send: async (_account, time) => {
        dates.push(localReminderTime(time, preferences.timeZone).date);
      },
    });
    for (let offset = 0; offset <= 80; offset++) {
      // After 08:00 local on both sides of the DST change in this sequence.
      await f.loop.tick(now + offset * day + 60 * 60_000);
    }
    expect(dates).toEqual([
      "2026-10-01",
      "2026-10-03",
      "2026-10-05",
      "2026-10-10",
      "2026-10-20",
      "2026-11-09",
      "2026-12-09",
    ]);
    fingerprint = "new-activity";
    await f.loop.tick(now + 81 * day + 60 * 60_000);
    expect(dates).toHaveLength(8);
    expect(f.index.due(now + 82 * day + 60 * 60_000)[0].attemptCount).toBe(1);
  });

  test("task activity restarts follow-ups, but cannot bypass the same-day guard", async () => {
    let fingerprint = "before";
    const f = fixture({ catalog: async () => ({ due: 10, fingerprint }) });
    await f.loop.tick(now);
    await f.loop.tick(now + 2 * day);
    fingerprint = "review";
    await f.loop.tick(now + 3 * day);
    expect(f.sends()).toBe(3);
    fingerprint = "another-review";
    f.index.schedule(account.authSubject, now + 3 * day);
    await f.loop.tick(now + 3 * day);
    expect(f.sends()).toBe(3);
    // Activity after today's attempt is observed at the next daily evaluation.
    await f.loop.tick(now + 4 * day);
    expect(f.sends()).toBe(4);
    await f.loop.tick(now + 5 * day);
    expect(f.sends()).toBe(4);
    await f.loop.tick(now + 6 * day);
    expect(f.sends()).toBe(5);
  });

  test("an empty queue resets backoff without requiring task activity", async () => {
    let due = 10;
    const f = fixture({
      catalog: async () => ({ due, fingerprint: "stable" }),
    });
    await f.loop.tick(now);
    due = 0;
    await f.loop.tick(now + day);
    due = 1;
    await f.loop.tick(now + 2 * day);
    expect(f.sends()).toBe(2);
    expect(f.index.due(now + 3 * day)[0].attemptCount).toBe(1);
  });

  test("empty catalogs wait until tomorrow; disabled and snoozed accounts do not scan", async () => {
    const empty = fixture({
      catalog: async () => ({ due: 0, fingerprint: "stable" }),
    });
    await empty.loop.tick(now);
    await empty.loop.tick(now + 60_000);
    expect(empty.sends()).toBe(0);
    for (const p of [
      { ...preferences, enabled: false },
      { ...preferences, snoozedUntilTimestampMillis: now + 7 * day },
    ]) {
      const f = fixture({ preferences: async () => p });
      await f.loop.tick(now);
      expect(f.reads()).toBe(0);
      expect(f.sends()).toBe(0);
    }
  });

  test("does not send before local notification time", async () => {
    const f = fixture({
      preferences: async () => ({ ...preferences, localTimeMinutes: 600 }),
    });
    await f.loop.tick(now);
    expect(f.reads()).toBe(0);
    await f.loop.tick(now + 60 * 60_000);
    expect(f.sends()).toBe(1);
  });

  test("overlapping ticks have only one worker", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture({
      catalog: async () => {
        await wait;
        return { due: 1, fingerprint: "stable" };
      },
    });
    const first = f.loop.tick(now),
      second = f.loop.tick(now);
    expect(second).toBe(first);
    release();
    await Promise.all([first, second]);
    expect(f.sends()).toBe(1);
  });

  test("ambiguous delivery failure consumes the day, including after restart", async () => {
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "orbit-reminder-test-"),
    );
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const filename = path.join(directory, "reminders.sqlite");
    let index = new ReminderIndex(filename),
      sends = 0;
    index.register(account);
    const dependencies = {
      preferences: async () => preferences,
      catalog: async () => ({ due: 1, fingerprint: "stable" }),
      send: async () => {
        sends++;
        throw new Error("Lost response after Mailjet accepted message");
      },
      logger: new MemorySafeLogger(),
    };
    await new ReminderLoop(index, dependencies).tick(now);
    const tokens = new ReminderActionTokens(index);
    const token = tokens.create("reader", now);
    index.close();
    index = new ReminderIndex(filename);
    cleanups.push(() => index.close());
    index.register(account); // reenrollment must not reset the attempt/deadline
    expect(new ReminderActionTokens(index).verify(token, now)).toBe("reader");
    const loop = new ReminderLoop(index, dependencies);
    await loop.tick(now + 60_000);
    expect(sends).toBe(1);
    await loop.tick(now + day);
    expect(sends).toBe(1);
    await loop.tick(now + 2 * day);
    expect(sends).toBe(2);
  });

  test("failure before recording an attempt can retry in five minutes", async () => {
    let fails = true;
    const f = fixture({
      catalog: async () => {
        if (fails) throw new Error("Storage unavailable");
        return { due: 1, fingerprint: "stable" };
      },
    });
    await f.loop.tick(now);
    expect(f.sends()).toBe(0);
    fails = false;
    await f.loop.tick(now + 60_000);
    expect(f.sends()).toBe(0);
    await f.loop.tick(now + 5 * 60_000);
    expect(f.sends()).toBe(1);
  });

  test("snooze and disable preserve the follow-up sequence", async () => {
    let currentPreferences = preferences;
    const f = fixture({ preferences: async () => currentPreferences });
    await f.loop.tick(now);
    currentPreferences = applyReminderAction(preferences, "snooze1Week", now);
    await f.loop.tick(now + day);
    expect(f.sends()).toBe(1);
    await f.loop.tick(now + 7 * day);
    expect(f.sends()).toBe(2);
    currentPreferences = { ...preferences, enabled: false };
    await f.loop.tick(now + 8 * day);
    expect(f.sends()).toBe(2);
    currentPreferences = preferences;
    await f.loop.tick(now + 9 * day);
    expect(f.sends()).toBe(3);
    expect(f.index.due(now + 10 * day)[0].attemptCount).toBe(3);
  });
});

test("current reminder database reopens without losing dates, deadlines, or signing keys", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "orbit-reminder-reopen-"),
  );
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "reminders.sqlite");
  let index = new ReminderIndex(filename);
  index.register(account);
  index.secret(() => "existing-key");
  index.recordAttempt(account.authSubject, "2026-10-01", now + day);
  index.close();
  index = new ReminderIndex(filename);
  index.register(account);
  expect(index.due(now)).toHaveLength(0);
  expect(index.due(now + day)[0]).toMatchObject({
    lastAttemptDate: "2026-10-01",
    nextEvaluation: now + day,
    attemptCount: 1,
    catalogFingerprint: null,
  });
  expect(index.secret(() => "replacement")).toBe("existing-key");
  expect(index.observeCatalog("reader", "baseline", true)).toBe(1);
  index.close();
  index = new ReminderIndex(filename);
  cleanups.push(() => index.close());
  expect(index.observeCatalog("reader", "baseline", true)).toBe(1);
  expect(index.observeCatalog("reader", "changed", true)).toBe(0);
  expect(index.due(now + day)[0].lastAttemptDate).toBe("2026-10-01");
});

test("backoff uses calendar days rather than 48-hour delays across DST", () => {
  expect(reminderBackoffAllowsAttempt("2026-03-08", "2026-03-07", 1)).toBe(
    false,
  );
  expect(reminderBackoffAllowsAttempt("2026-03-09", "2026-03-07", 1)).toBe(
    true,
  );
  expect(reminderBackoffAllowsAttempt("2026-11-02", "2026-10-31", 1)).toBe(
    true,
  );
  expect(reminderBackoffAllowsAttempt("2027-01-01", "2026-10-01", 7)).toBe(
    false,
  );
});

test("local scheduling handles DST gaps and folds without two attempts in a day", () => {
  const gap = Date.parse("2026-03-08T08:00:00Z");
  expect(
    nextReminderEvaluation(gap, { ...preferences, localTimeMinutes: 150 }),
  ).toBe(Date.parse("2026-03-08T10:00:00Z"));
  const fold = Date.parse("2026-11-01T08:30:00Z");
  const next = nextReminderEvaluation(
    fold,
    { ...preferences, localTimeMinutes: 90 },
    "2026-11-01",
  );
  expect(localReminderTime(next, preferences.timeZone)).toEqual({
    date: "2026-11-02",
    minutes: 90,
  });
});

test("settings actions validate, preserve local time, and tokens cannot access another account", () => {
  expect(applyReminderAction(preferences, "unsubscribe", now)).toEqual({
    ...preferences,
    enabled: false,
  });
  expect(applyReminderAction(preferences, "snooze1Week", now)).toEqual({
    ...preferences,
    snoozedUntilTimestampMillis: now + 7 * day,
  });
  expect(() =>
    decodeNotificationPreferences({ ...preferences, localTimeMinutes: 1440 }),
  ).toThrow();
  expect(() =>
    decodeNotificationPreferences({ ...preferences, timeZone: "Not/AZone" }),
  ).toThrow();
  const f = fixture(),
    tokens = new ReminderActionTokens(f.index),
    token = tokens.create("reader", now);
  expect(tokens.verify(token, now)).toBe("reader");
  expect(() => tokens.verify(token + "x", now)).toThrow();
  expect(() => tokens.verify(token, now + 14 * day)).toThrow();
});

test("Mailjet checks per-message success and disables click tracking", async () => {
  const f = fixture(),
    tokens = new ReminderActionTokens(f.index);
  let status = "success",
    calls = 0;
  const send = createReminderDelivery({
    apiKey: "key",
    secretKey: "secret",
    publicOrigin: "https://sync.example.test",
    actionTokens: tokens,
    firestore: {
      collection: () => ({
        doc: () => ({ id: "review-code", set: async () => {} }),
      }),
    } as never,
    fetchImplementation: (async (_url, request) => {
      calls++;
      const body = JSON.parse(String(request?.body));
      expect(body.Messages[0].TrackClicks).toBe("disabled");
      expect(body.Messages[0].TextPart).toContain(
        "https://withorbit.com/review?accessCode=review-code",
      );
      expect(body.Messages[0].HTMLPart).toContain("&amp;action=unsubscribe");
      return Response.json({ Messages: [{ Status: status }] });
    }) as typeof fetch,
  });
  const row = {
    ...account,
    lastAttemptDate: null,
    attemptCount: 0,
    catalogFingerprint: null,
  };
  await send(row, now);
  status = "error";
  await expect(send(row, now)).rejects.toThrow("rejected");
  expect(calls).toBe(2);
});
