import { describe, expect, test } from "bun:test";
import { isHostedSyncAccountEligible } from "./hostedSyncCohort.js";

describe("hosted sync cohort", () => {
  test("an empty allowlist enables every account in an explicitly gated build", () => {
    expect(isHostedSyncAccountEligible("user-a", [])).toBe(true);
  });

  test("a populated allowlist enables only the named Firebase identities", () => {
    expect(isHostedSyncAccountEligible("user-a", ["user-a"])).toBe(true);
    expect(isHostedSyncAccountEligible("user-b", ["user-a"])).toBe(false);
  });
});
