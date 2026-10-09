import { describe, expect, test } from "bun:test";
import { MemorySafeLogger } from "./safeLogger.js";

describe("safe service logger", () => {
  test("records only allowlisted scalar telemetry shapes", () => {
    const logger = new MemorySafeLogger();
    logger.event("socket", { activeSockets: 2, draining: false });
    logger.error("socket_failed", new Error("secret-value"));
    expect(logger.lines.join("\n")).not.toContain("secret-value");
    expect(() =>
      logger.event("unsafe", { authorizationTokenCount: 1 }),
    ).toThrow("Sensitive telemetry field rejected");
  });
});
