import { describe, test, expect, beforeEach } from "bun:test";
import { UpdateNotificationSettingsAction } from "../../firebaseFunctions/updateNotificationSettings.js";
import { resetLocalEmulators } from "../emulators.js";
import {
  getTestUserMetadata,
  setupAccessCode,
  setupAuthToken,
  getTestFirebaseAdminApp,
} from "../firebaseTesting.js";
import { getFirestore } from "firebase-admin/firestore";
import { newHostedVaultAccountRecord } from "../../db/hostedVaultAccounts.js";
import { fetchRoute } from "./utils/fetchRoute.js";

beforeEach(async () => {
  await resetLocalEmulators();
});

async function attemptUpdate(
  action: UpdateNotificationSettingsAction,
  token: string | null,
) {
  return await fetchRoute(`/updateNotificationSettings?action=${action}`, {
    method: "POST",
    json: {},
    authorization: token ? { token } : undefined,
    followRedirects: false,
  });
}

describe("/updateNotificationSettings", () => {
  test("old email action for a server-managed account forwards to its vault, not legacy metadata", async () => {
    await setupAccessCode("oldEmailCode", "testUserID");
    const database = getFirestore(getTestFirebaseAdminApp());
    const account = newHostedVaultAccountRecord(
      {
        authIssuer: "https://securetoken.google.com/metabook-system",
        authSubject: "testUserID",
        emailAddress: "reader@example.test",
        registrationTimestampMillis: Date.now(),
        mode: "new-automerge",
      },
      "vault",
    );
    await database
      .doc("hostedVaultAccounts/testUserID")
      .set({ ...account, notificationMode: "server" });
    const response = await fetchRoute(
      "/updateNotificationSettings?action=unsubscribe&accessCode=oldEmailCode",
      {
        method: "POST",
        json: {},
        followRedirects: false,
      },
    );
    expect(response.status).toBe(302);
    const redirect = new URL(response.headers.get("location")!);
    expect(redirect.pathname).toBe("/settings");
    expect(redirect.searchParams.get("notificationAction")).toBe("unsubscribe");
    const code = redirect.searchParams.get("accessCode")!;
    expect(
      (await database.doc(`accessCodes/${code}`).get()).data()?.userID,
    ).toBe("testUserID");
    expect((await database.doc("accessCodes/oldEmailCode").get()).exists).toBe(
      false,
    );
    expect(await getTestUserMetadata("testUserID")).not.toHaveProperty(
      "isUnsubscribedFromSessionNotifications",
    );
  });
  test("GET asks for confirmation without consuming the access code", async () => {
    await setupAccessCode("oneTimeCode", "testUserID");
    const path =
      "/updateNotificationSettings?action=unsubscribe&accessCode=oneTimeCode";

    const confirmation = await fetchRoute(path);
    expect(confirmation.status).toBe(200);
    expect(confirmation.body).toContain(
      "Unsubscribe from review notifications?",
    );
    expect(await getTestUserMetadata("testUserID")).not.toHaveProperty(
      "isUnsubscribedFromSessionNotifications",
    );

    const result = await fetchRoute(path, {
      method: "POST",
      json: {},
      followRedirects: false,
    });
    expect(result.status).toBe(302);
    expect(
      (await getTestUserMetadata("testUserID"))!
        .isUnsubscribedFromSessionNotifications,
    ).toBe(true);
  });

  test("fails without auth", async () => {
    const { status, body } = await attemptUpdate("unsubscribe", null);
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("fails with invalid auth", async () => {
    const { status, body } = await attemptUpdate("unsubscribe", "invalid");
    expect(status).toBe(401);
    expect(body).toBeUndefined();
  });

  test("unsubscribes", async () => {
    await setupAuthToken("test", "testUserID");
    const { status, body } = await attemptUpdate("unsubscribe", "test");
    expect(status).toBe(302);
    expect(body).toBeUndefined();

    const metadata = await getTestUserMetadata("testUserID");
    expect(metadata!.isUnsubscribedFromSessionNotifications).toBe(true);
  });

  test("snoozes", async () => {
    await setupAuthToken("test", "testUserID");
    const { status, body } = await attemptUpdate("snooze1Week", "test");
    expect(status).toBe(302);
    expect(body).toBeUndefined();

    const metadata = await getTestUserMetadata("testUserID");
    expect(metadata!.isUnsubscribedFromSessionNotifications).toBe(false);
    expect(
      metadata!.snoozeSessionNotificationsUntilTimestampMillis,
    ).toBeGreaterThan(Date.now());
  });

  test("unsubscribing then snoozing resubscribes", async () => {
    await setupAuthToken("test", "testUserID");
    await attemptUpdate("unsubscribe", "test");
    await attemptUpdate("snooze1Week", "test");
    const metadata = await getTestUserMetadata("testUserID");
    expect(metadata!.isUnsubscribedFromSessionNotifications).toBe(false);
  });

  test("fails for unknown action", async () => {
    await setupAuthToken("test");
    // @ts-ignore
    const { status, body } = await attemptUpdate("invalid", "test");
    expect(status).toBe(400);
    expect(body).toBeUndefined();
  });
});
