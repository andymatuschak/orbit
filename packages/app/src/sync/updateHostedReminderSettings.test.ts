import { expect, test } from "bun:test";
import { updateHostedReminderSettings } from "./updateHostedReminderSettings.js";

test("confirmed old email settings action signs into the email's account before changing its vault", async () => {
  const calls: string[] = [];
  await updateHostedReminderSettings({
    accessCode: "code",
    action: "unsubscribe",
    serviceOrigin: "https://sync.example.test",
    authentication: {
      getLoginTokenUsingAccessCode: async (code) => {
        calls.push(code);
        return "login-token" as never;
      },
      signInWithLoginToken: async (token) => {
        calls.push(String(token));
      },
      getCurrentIDToken: async () => {
        calls.push("current-token");
        return "id-token" as never;
      },
    },
    fetchImplementation: (async (url, request) => {
      calls.push(String(url));
      expect(request?.headers).toEqual({
        Authorization: "ID id-token",
        "Content-Type": "application/json",
      });
      expect(JSON.parse(String(request?.body))).toEqual({
        action: "unsubscribe",
      });
      return Response.json({});
    }) as typeof fetch,
  });
  expect(calls).toEqual([
    "code",
    "login-token",
    "current-token",
    "https://sync.example.test/v1/notification-settings",
  ]);
});
