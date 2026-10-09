import type { NotificationPreferences } from "@withorbit/core";

const reminderDelayDays = [2, 2, 5, 10, 20, 30] as const;

/** Calendar-day gaps at the user's configured local time, including DST. */
export function reminderBackoffAllowsAttempt(
  localDate: string,
  lastAttemptDate: string | null,
  attemptCount: number,
) {
  if (attemptCount === 0 || lastAttemptDate === null) return true;
  const delayDays = reminderDelayDays[attemptCount - 1];
  if (delayDays === undefined) return false;
  const earliestDate = new Date(
    Date.parse(lastAttemptDate) + delayDays * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);
  return localDate >= earliestDate;
}

export function localReminderTime(now: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (key: string) => parts.find((part) => part.type === key)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

/** First eligible minute, including DST gaps/folds, not a fixed 24-hour delay. */
export function nextReminderEvaluation(
  now: number,
  preferences: NotificationPreferences,
  skipLocalDate: string | null = null,
) {
  const earliest = Math.max(now, preferences.snoozedUntilTimestampMillis ?? 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: preferences.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  // At most two local days. Only a handful of accounts are due each tick;
  // this avoids another timezone dependency and handles nonexistent times.
  for (let minute = 0; minute <= 3000; minute++) {
    const candidate = earliest + minute * 60_000;
    const parts = formatter.formatToParts(candidate);
    const value = (key: string) =>
      parts.find((part) => part.type === key)!.value;
    const date = `${value("year")}-${value("month")}-${value("day")}`;
    if (
      date !== skipLocalDate &&
      Number(value("hour")) * 60 + Number(value("minute")) >=
        preferences.localTimeMinutes
    ) {
      return candidate;
    }
  }
  throw new Error("Could not schedule next reminder");
}
