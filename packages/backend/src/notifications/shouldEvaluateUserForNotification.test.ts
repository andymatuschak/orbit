import * as dateFns from "date-fns";
import { shouldEvaluateUserForNotification } from "./shouldEvaluateUserForNotification.js";

test("don't bother with recently registered users", () => {
  expect(
    shouldEvaluateUserForNotification(
      { registrationTimestampMillis: 5000 },
      10000,
    ),
  ).toBeFalsy();
});

const baseMetadata = {
  registrationTimestampMillis: dateFns.subDays(Date.now(), 1).valueOf(),
};

test("should process users in the base case", () => {
  expect(shouldEvaluateUserForNotification(baseMetadata, Date.now())).toBe(
    true,
  );
});

test("should skip unsubscribed users", () => {
  expect(
    shouldEvaluateUserForNotification(
      { ...baseMetadata, isUnsubscribedFromSessionNotifications: true },
      Date.now(),
    ),
  ).toBe(false);
});

describe("snoozed", () => {
  test("should skip snoozed users", () => {
    expect(
      shouldEvaluateUserForNotification(
        {
          ...baseMetadata,
          snoozeSessionNotificationsUntilTimestampMillis: Date.now() + 1000,
        },
        Date.now(),
      ),
    ).toBe(false);
  });

  test("should email users with expired snoozes", () => {
    expect(
      shouldEvaluateUserForNotification(
        {
          ...baseMetadata,
          snoozeSessionNotificationsUntilTimestampMillis: Date.now() - 1000,
        },
        Date.now(),
      ),
    ).toBe(true);
  });
});
