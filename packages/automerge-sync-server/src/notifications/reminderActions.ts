import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NotificationPreferences } from "@withorbit/core";
import type { ReminderIndex } from "./reminderIndex.js";

export type ReminderAction = "unsubscribe" | "snooze1Week";
export function isReminderAction(value: unknown): value is ReminderAction {
  return value === "unsubscribe" || value === "snooze1Week";
}

/** One persisted key, no ticket store. Tokens grant reminder changes, not vault access. */
export class ReminderActionTokens {
  private readonly secret: string;
  constructor(index: ReminderIndex) {
    this.secret = index.secret(() => randomBytes(32).toString("hex"));
  }
  create(subject: string, now: number) {
    const body = Buffer.from(
      JSON.stringify({ subject, expires: now + 14 * 24 * 60 * 60_000 }),
    ).toString("base64url");
    return `${body}.${this.signature(body).toString("base64url")}`;
  }
  verify(token: string, now: number): string {
    if (token.length > 1024) throw new TypeError("Invalid reminder action");
    const [body, encodedSignature, extra] = token.split(".");
    if (!body || !encodedSignature || extra)
      throw new TypeError("Invalid reminder action");
    const signature = Buffer.from(encodedSignature, "base64url");
    const expected = this.signature(body);
    if (
      signature.length !== expected.length ||
      !timingSafeEqual(signature, expected)
    )
      throw new TypeError("Invalid reminder action");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (
      typeof payload.subject !== "string" ||
      payload.subject.length > 128 ||
      !Number.isSafeInteger(payload.expires) ||
      payload.expires <= now
    )
      throw new TypeError("Expired reminder action");
    return payload.subject;
  }
  private signature(body: string) {
    return createHmac("sha256", this.secret).update(body).digest();
  }
}

export function applyReminderAction(
  preferences: NotificationPreferences,
  action: ReminderAction,
  now: number,
): NotificationPreferences {
  return {
    ...preferences,
    enabled: action !== "unsubscribe",
    snoozedUntilTimestampMillis:
      action === "snooze1Week"
        ? now + 7 * 24 * 60 * 60_000
        : preferences.snoozedUntilTimestampMillis,
  };
}

export function reminderConfirmationHTML(action: ReminderAction) {
  const title =
    action === "unsubscribe"
      ? "Unsubscribe from review notifications?"
      : "Snooze review notifications for a week?";
  const button = action === "unsubscribe" ? "Unsubscribe" : "Snooze for a week";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title><style>body{background:#f5f7e8;color:#25271f;font:20px/1.5 system-ui;margin:0}main{margin:12vh auto;max-width:32rem;padding:2rem}h1{font-size:2rem;line-height:1.2}button{font:inherit;padding:.7rem 1rem}a{color:inherit;margin-left:1rem}</style></head><body><main><h1>${title}</h1><form method="post"><button type="submit">${button}</button><a href="https://withorbit.com">Cancel</a></form></main></body></html>`;
}
