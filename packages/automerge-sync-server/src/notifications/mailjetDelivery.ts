import { reviewReminderEmail } from "@withorbit/api";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import type { ReminderAccount } from "./reminderIndex.js";
import type { ReminderActionTokens } from "./reminderActions.js";

export function createReminderDelivery(input: {
  firestore: Firestore;
  apiKey: string;
  secretKey: string;
  publicOrigin: string;
  actionTokens: ReminderActionTokens;
  fetchImplementation?: typeof fetch;
}) {
  const fetchImplementation = input.fetchImplementation ?? fetch;
  return async (account: ReminderAccount, now: number) => {
    // Review links retain Orbit's existing identity/login boundary. Scheduling
    // and settings no longer depend on Firestore; identity migration is separate.
    const accessCode = input.firestore.collection("accessCodes").doc();
    await accessCode.set({
      userID: account.authSubject,
      type: "oneTime",
      expirationTimestamp: Timestamp.fromMillis(now + 14 * 24 * 60 * 60_000),
    });
    const actionURL = new URL("/notifications", input.publicOrigin);
    actionURL.searchParams.set(
      "token",
      input.actionTokens.create(account.authSubject, now),
    );
    const link = (action: string) => {
      const url = new URL(actionURL);
      url.searchParams.set("action", action);
      return url.href;
    };
    const spec = reviewReminderEmail({
      reviewURL: `https://withorbit.com/review?accessCode=${encodeURIComponent(accessCode.id)}`,
      snoozeURL: link("snooze1Week"),
      unsubscribeURL: link("unsubscribe"),
    });
    const response = await fetchImplementation(
      "https://api.mailjet.com/v3.1/send",
      {
        method: "POST",
        signal: AbortSignal.timeout(15_000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${input.apiKey}:${input.secretKey}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          Messages: [
            {
              From: { Email: "notifications@withorbit.com", Name: "Orbit" },
              ReplyTo: {
                Email: "contact@withorbit.com",
                Name: "Andy Matuschak (Orbit author)",
              },
              To: [{ Email: account.emailAddress }],
              Subject: spec.subject,
              TextPart: spec.text,
              HTMLPart: spec.html,
              TrackClicks: "disabled",
            },
          ],
        }),
      },
    );
    if (!response.ok) throw new Error("Reminder delivery rejected");
    const result = (await response.json()) as {
      Messages?: { Status?: string }[];
    };
    if (result.Messages?.[0]?.Status !== "success")
      throw new Error("Reminder delivery rejected");
  };
}
