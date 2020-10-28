import * as dateFns from "date-fns";
import { shouldEvaluateUserForNotification } from "./shouldEvaluateUserForNotification";

test("don't bother with recently registered users", () => {
  expect(
    shouldEvaluateUserForNotification(
      { registrationTimestampMillis: 5000 },
      10000,
    ),
  ).toBeFalsy();
});

test("should process aged users", () => {
  expect(
    shouldEvaluateUserForNotification(
      {
        registrationTimestampMillis: dateFns.subDays(Date.now(), 1).valueOf(),
      },
      Date.now(),
    ),
  ).toBeTruthy();
});
