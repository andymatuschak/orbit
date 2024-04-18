import { UpdateNotificationSettingsAction } from "../../firebaseFunctions/updateNotificationSettings.js";
import { resetLocalEmulators } from "../emulators.js";
import { getTestUserMetadata, setupAuthToken } from "../firebaseTesting.js";
import { fetchRoute } from "./utils/fetchRoute.js";

beforeEach(async () => {
  await resetLocalEmulators();
});

async function attemptUpdate(
  action: UpdateNotificationSettingsAction,
  token: string | null,
) {
  return await fetchRoute(`/updateNotificationSettings?action=${action}`, {
    method: "GET",
    authorization: token ? { token } : undefined,
    followRedirects: false,
  });
}

describe("/updateNotificationSettings", () => {
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
