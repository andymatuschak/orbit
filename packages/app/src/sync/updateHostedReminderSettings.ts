import type { AuthenticationClient } from "../authentication/index.js";

/** Compatibility for a confirmed action in an email sent before the handoff. */
export async function updateHostedReminderSettings(input: {
  authentication: Pick<
    AuthenticationClient,
    | "getLoginTokenUsingAccessCode"
    | "signInWithLoginToken"
    | "getCurrentIDToken"
  >;
  accessCode: string;
  action: "unsubscribe" | "snooze1Week";
  serviceOrigin: string;
  fetchImplementation?: typeof fetch;
}) {
  const loginToken = await input.authentication.getLoginTokenUsingAccessCode(
    input.accessCode,
  );
  // The email's identity is authoritative, not a different already-open login.
  await input.authentication.signInWithLoginToken(loginToken);
  const token = await input.authentication.getCurrentIDToken();
  const response = await (input.fetchImplementation ?? fetch)(
    new URL("/v1/notification-settings", input.serviceOrigin),
    {
      method: "POST",
      headers: {
        Authorization: `ID ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: input.action }),
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    },
  );
  if (!response.ok) throw new Error("Could not update vault reminder settings");
}
