import { describe, expect, test } from "bun:test";
import {
  assertExactSimulatorFixtureEvent,
  assertExpectedEmulatorHubRegistry,
  assertExpectedSimulatorAPIBaseURL,
  expectedSimulatorEmulators,
  restartImportedEmulatorInstruction,
  simulatorSmokeEvent,
  simulatorSmokeEventID,
  simulatorSmokeTaskID,
} from "./seedSimulator.js";

function makeExpectedRegistry(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(expectedSimulatorEmulators).map(([name, endpoint]) => [
      name,
      { name, ...endpoint },
    ]),
  );
}

describe("simulator emulator guard", () => {
  test("accepts only the expected loopback service map", () => {
    expect(() =>
      assertExpectedEmulatorHubRegistry(makeExpectedRegistry()),
    ).not.toThrow();

    const wrongHost = makeExpectedRegistry();
    wrongHost.auth = { name: "auth", host: "localhost", port: 9099 };
    expect(() => assertExpectedEmulatorHubRegistry(wrongHost)).toThrow(
      "unexpected auth emulator endpoint",
    );

    const missingService = makeExpectedRegistry();
    delete missingService.storage;
    expect(() => assertExpectedEmulatorHubRegistry(missingService)).toThrow(
      "storage emulator is not registered",
    );
  });

  test("rejects a non-loopback or wrong-project API URL", () => {
    expect(() =>
      assertExpectedSimulatorAPIBaseURL(
        "http://127.0.0.1:5001/metabook-system/us-central1/api",
      ),
    ).not.toThrow();
    expect(() =>
      assertExpectedSimulatorAPIBaseURL(
        "http://127.0.0.1:5001/another-project/us-central1/api",
      ),
    ).toThrow("Refusing to seed unexpected API URL");
    expect(() =>
      assertExpectedSimulatorAPIBaseURL(
        "https://withorbit.com/metabook-system/us-central1/api",
      ),
    ).toThrow("Refusing to seed unexpected API URL");
  });
});

describe("simulator fixture verification", () => {
  test("uses fixed valid Orbit IDs", () => {
    expect(simulatorSmokeTaskID).toHaveLength(22);
    expect(simulatorSmokeEventID).toHaveLength(22);
    expect(simulatorSmokeTaskID).toMatch(/^[0-9a-zA-Z_-]{22}$/);
    expect(simulatorSmokeEventID).toMatch(/^[0-9a-zA-Z_-]{22}$/);
  });

  test("accepts only the exact untouched ingest fixture", () => {
    expect(() =>
      assertExactSimulatorFixtureEvent({
        type: "list",
        hasMore: false,
        items: [simulatorSmokeEvent],
      }),
    ).not.toThrow();
  });

  test("rejects missing, partial, conflicting, or later fixture events", () => {
    expect(() =>
      assertExactSimulatorFixtureEvent({
        type: "list",
        hasMore: false,
        items: [],
      }),
    ).toThrow(restartImportedEmulatorInstruction);

    expect(() =>
      assertExactSimulatorFixtureEvent({
        type: "list",
        hasMore: true,
        items: [simulatorSmokeEvent],
      }),
    ).toThrow(restartImportedEmulatorInstruction);

    const conflictingEvent = structuredClone(simulatorSmokeEvent);
    conflictingEvent.spec.content.body.text = "Unexpected prompt";
    expect(() =>
      assertExactSimulatorFixtureEvent({
        type: "list",
        hasMore: false,
        items: [conflictingEvent],
      }),
    ).toThrow(restartImportedEmulatorInstruction);

    expect(() =>
      assertExactSimulatorFixtureEvent({
        type: "list",
        hasMore: false,
        items: [
          simulatorSmokeEvent,
          {
            id: "simulatorReviewEvent01",
            entityID: simulatorSmokeTaskID,
            type: "taskRepetition",
          },
        ],
      }),
    ).toThrow(restartImportedEmulatorInstruction);
  });
});
