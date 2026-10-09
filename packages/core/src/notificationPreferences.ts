/** Reminder policy, independent of the review scheduler (including FSRS). */
export interface NotificationPreferences {
  enabled: boolean;
  snoozedUntilTimestampMillis: number | null;
  localTimeMinutes: number;
  timeZone: string;
}

export function decodeNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid notification preferences");
  }
  const raw = value as Record<string, unknown>;
  const timeZone = String(raw.timeZone);
  if (
    typeof raw.enabled !== "boolean" ||
    !(
      raw.snoozedUntilTimestampMillis === null ||
      (typeof raw.snoozedUntilTimestampMillis === "number" &&
        Number.isSafeInteger(raw.snoozedUntilTimestampMillis) &&
        raw.snoozedUntilTimestampMillis >= 0)
    ) ||
    typeof raw.localTimeMinutes !== "number" ||
    !Number.isInteger(raw.localTimeMinutes) ||
    raw.localTimeMinutes < 0 ||
    raw.localTimeMinutes >= 1440 ||
    timeZone.length > 100
  )
    throw new TypeError("Invalid notification preferences");
  // Intl rejects unknown IANA zones. ImmutableString also supports String().
  new Intl.DateTimeFormat("en-US", { timeZone });
  return {
    enabled: raw.enabled,
    snoozedUntilTimestampMillis: raw.snoozedUntilTimestampMillis as
      number | null,
    localTimeMinutes: raw.localTimeMinutes,
    timeZone,
  };
}
