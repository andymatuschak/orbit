import { describe, expect, test } from "bun:test";
import { shouldSkipBodyLogging } from "./api.js";

describe("API body-log redaction", () => {
  test("omits every authentication exchange while retaining ordinary routes", () => {
    expect(
      [
        "/internal/auth/consumeAccessCode",
        "/internal/auth/createLoginToken",
        "/internal/auth/refreshSessionCookie",
        "/internal/auth/personalAccessTokens",
      ].every(shouldSkipBodyLogging),
    ).toBe(true);
    expect(shouldSkipBodyLogging("/events")).toBe(false);
    expect(shouldSkipBodyLogging("/internal/authentication-status")).toBe(
      false,
    );
  });
});
