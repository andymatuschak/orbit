import * as dateFns from "date-fns";
import { UserMetadata } from "metabook-firebase-support";
import { generateDuePromptStates } from "./__fixtures__/generateDuePromptStates";
import {
  _getUserNotificationAction,
  _updateSessionNotificationStateForNewNotification,
} from "./processUserNotification";

describe("_updateSessionNotificationStateForNewNotification", () => {
  test("reminder", () => {
    expect(
      _updateSessionNotificationStateForNewNotification(5, {
        firstNotificationTimestampMillis: 1,
        lastNotificationTimestampMillis: 1,
        sentNotificationCount: 1,
      }),
    ).toMatchObject({
      firstNotificationTimestampMillis: 1,
      lastNotificationTimestampMillis: 5,
      sentNotificationCount: 2,
    });
  });

  test("new session", () => {
    expect(
      _updateSessionNotificationStateForNewNotification(5, null),
    ).toMatchObject({
      firstNotificationTimestampMillis: 5,
      lastNotificationTimestampMillis: 5,
      sentNotificationCount: 1,
    });
  });
});

describe("_getUserNotificationAction", () => {
  const testTimestamp = 10000;
  const baseMetadata: UserMetadata = {
    registrationTimestampMillis: 0,
  };
  const emailAccessMock = jest.fn().mockResolvedValue("accessCode");
  beforeEach(() => {
    emailAccessMock.mockClear();
  });

  const fetchManyPromptsDueMock = async () =>
    generateDuePromptStates(testTimestamp, 100, -5, 5);

  test("no session, not due yet", async () => {
    expect(
      await _getUserNotificationAction(
        testTimestamp,
        "",
        baseMetadata,
        async () => [],
        emailAccessMock,
      ),
    ).toBeNull();
    expect(emailAccessMock).not.toBeCalled();
  });

  test("no session, due", async () => {
    expect(
      await _getUserNotificationAction(
        testTimestamp,
        "",
        baseMetadata,
        fetchManyPromptsDueMock,
        emailAccessMock,
      ),
    ).not.toBeNull();
    expect(emailAccessMock).toBeCalled();
  });

  test("existing session, recently notified", async () => {
    expect(
      await _getUserNotificationAction(
        testTimestamp,
        "",
        {
          ...baseMetadata,
          sessionNotificationState: {
            sentNotificationCount: 1,
            firstNotificationTimestampMillis: testTimestamp - 1000,
            lastNotificationTimestampMillis: testTimestamp - 1000,
          },
        },
        jest.fn().mockImplementation(() => fail("Should not be called")),
        emailAccessMock,
      ),
    ).toBeNull();
    expect(emailAccessMock).not.toBeCalled();
  });

  test("existing session, did not recently notify", async () => {
    const notificationTimestamp = dateFns.subDays(testTimestamp, 5).valueOf();
    expect(
      await _getUserNotificationAction(
        testTimestamp,
        "",
        {
          ...baseMetadata,
          sessionNotificationState: {
            sentNotificationCount: 1,
            firstNotificationTimestampMillis: notificationTimestamp,
            lastNotificationTimestampMillis: notificationTimestamp,
          },
        },
        fetchManyPromptsDueMock,
        emailAccessMock,
      ),
    ).not.toBeNull();
    expect(emailAccessMock).toBeCalled();
  });
});
