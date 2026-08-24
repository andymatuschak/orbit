import { isDeepStrictEqual } from "node:util";

interface SimulatorTaskIngestEvent {
  id: string;
  entityID: string;
  type: "taskIngest";
  timestampMillis: number;
  provenance: null;
  metadata: Record<string, string>;
  spec: {
    type: "memory";
    content: {
      type: "qa";
      body: { text: string; attachments: string[] };
      answer: { text: string; attachments: string[] };
    };
  };
}

export const simulatorFixtureCredentials = {
  email: "test@test.com",
  password: "testtest",
  personalAccessToken: "TEST",
} as const;

export const simulatorSmokeTaskID = "simulatorSmokeTask0001";
export const simulatorSmokeEventID = "simulatorSmokeEvent001";

export const simulatorSmokeEvent: SimulatorTaskIngestEvent = {
  id: simulatorSmokeEventID,
  entityID: simulatorSmokeTaskID,
  type: "taskIngest",
  timestampMillis: 1_700_000_000_000,
  provenance: null,
  metadata: {
    fixture: "simulator-smoke-v1",
  },
  spec: {
    type: "memory",
    content: {
      type: "qa",
      body: {
        text: "Orbit simulator smoke test: is the local fixture working?",
        attachments: [],
      },
      answer: {
        text: "Yes. This QA card was seeded through the local Orbit API.",
        attachments: [],
      },
    },
  },
};

export const expectedSimulatorEmulators = {
  auth: { host: "127.0.0.1", port: 9099 },
  functions: { host: "127.0.0.1", port: 5001 },
  firestore: { host: "127.0.0.1", port: 8080 },
  pubsub: { host: "127.0.0.1", port: 8085 },
  storage: { host: "127.0.0.1", port: 9199 },
} as const;

const emulatorHubURL = "http://127.0.0.1:4400/emulators";
const expectedProjectID = "metabook-system";
const simulatorAPIBaseURL = `http://127.0.0.1:5001/${expectedProjectID}/us-central1/api`;
const expectedAPIPath = new URL(simulatorAPIBaseURL).pathname;
const requestTimeoutMillis = 10_000;
const orbitIDPattern = /^[0-9a-zA-Z_-]{22}$/;

export const restartImportedEmulatorInstruction =
  "Stop and restart the imported emulator suite, then run seed:simulator again before reviewing the card.";

type JSONObject = Record<string, unknown>;

function isJSONObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertExpectedSimulatorAPIBaseURL(baseURL: string): void {
  const parsedURL = new URL(baseURL);
  assertCondition(
    parsedURL.protocol === "http:" &&
      parsedURL.hostname === "127.0.0.1" &&
      parsedURL.port === "5001" &&
      parsedURL.pathname === expectedAPIPath &&
      parsedURL.search === "" &&
      parsedURL.hash === "",
    `Refusing to seed unexpected API URL: ${baseURL}`,
  );
}

export function assertExpectedEmulatorHubRegistry(registry: unknown): void {
  assertCondition(
    isJSONObject(registry),
    "Firebase Emulator Hub returned an invalid service registry",
  );

  for (const [name, expected] of Object.entries(expectedSimulatorEmulators)) {
    const service = registry[name];
    assertCondition(
      isJSONObject(service),
      `Required ${name} emulator is not registered`,
    );
    assertCondition(
      service.name === name &&
        service.host === expected.host &&
        service.port === expected.port,
      `Refusing unexpected ${name} emulator endpoint; expected ${expected.host}:${expected.port}`,
    );
  }
}

function assertValidFixtureDefinition(): void {
  assertCondition(
    orbitIDPattern.test(simulatorSmokeTaskID),
    "Simulator fixture task ID must be exactly 22 URL-safe characters",
  );
  assertCondition(
    orbitIDPattern.test(simulatorSmokeEventID),
    "Simulator fixture event ID must be exactly 22 URL-safe characters",
  );
}

function assertEventListResponse(
  response: unknown,
): asserts response is { type: "list"; hasMore: boolean; items: unknown[] } {
  assertCondition(
    isJSONObject(response) &&
      response.type === "list" &&
      typeof response.hasMore === "boolean" &&
      Array.isArray(response.items),
    "Orbit API returned an invalid event list",
  );
}

export function assertExactSimulatorFixtureEvent(response: unknown): void {
  assertEventListResponse(response);
  assertCondition(
    response.hasMore === false,
    `Orbit API fixture verification returned a partial event list. ${restartImportedEmulatorInstruction}`,
  );

  assertCondition(
    response.items.length === 1,
    `The simulator smoke task has ${response.items.length} events; only the untouched ingest fixture is valid. ${restartImportedEmulatorInstruction}`,
  );
  assertCondition(
    isDeepStrictEqual(response.items[0], simulatorSmokeEvent),
    `The simulator smoke task does not match the untouched ingest fixture. ${restartImportedEmulatorInstruction}`,
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  return await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMillis),
  });
}

async function assertExpectedEmulatorSuiteIsLive(): Promise<void> {
  let response: Response;
  try {
    response = await fetchWithTimeout(emulatorHubURL);
  } catch (error) {
    throw new Error(
      `Firebase Emulator Hub is not reachable at 127.0.0.1:4400: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  assertCondition(
    response.ok,
    `Firebase Emulator Hub returned HTTP ${response.status}`,
  );
  assertExpectedEmulatorHubRegistry(await response.json());
}

function createEventsURL(query: Record<string, string | number> = {}): URL {
  assertExpectedSimulatorAPIBaseURL(simulatorAPIBaseURL);
  const url = new URL(`${simulatorAPIBaseURL}/events`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function assertOrbitAPIStatus(
  response: Response,
  expectedStatus: number,
): Promise<void> {
  if (response.status !== expectedStatus) {
    const responseBody = await response.text().catch(() => "");
    throw new Error(
      `Orbit API returned HTTP ${response.status}; expected ${expectedStatus}${responseBody ? `: ${responseBody}` : ""}`,
    );
  }
}

async function getOrbitEvents(
  query: Record<string, string | number> = {},
): Promise<unknown> {
  const response = await fetchWithTimeout(createEventsURL(query), {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${simulatorFixtureCredentials.personalAccessToken}`,
    },
  });
  await assertOrbitAPIStatus(response, 200);
  return await response.json();
}

async function patchSimulatorSmokeEvent(): Promise<void> {
  const response = await fetchWithTimeout(createEventsURL(), {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      Authorization: `Token ${simulatorFixtureCredentials.personalAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([simulatorSmokeEvent]),
  });
  await assertOrbitAPIStatus(response, 204);
}

async function seedSimulator(): Promise<void> {
  assertValidFixtureDefinition();
  await assertExpectedEmulatorSuiteIsLive();

  // This read verifies the tracked TEST token, Firestore, and the exact
  // metabook-system Functions route before the first write occurs.
  const projectProbe = await getOrbitEvents({ limit: 1 });
  assertEventListResponse(projectProbe);

  const existingFixtureEvents = await getOrbitEvents({
    entityID: simulatorSmokeTaskID,
  });
  assertEventListResponse(existingFixtureEvents);

  if (
    existingFixtureEvents.hasMore === false &&
    existingFixtureEvents.items.length === 0
  ) {
    await patchSimulatorSmokeEvent();
  } else {
    // An exact ingest-only fixture is a safe rerun. Any review or mutation is
    // rejected before PATCH so the imported baseline remains the reset path.
    assertExactSimulatorFixtureEvent(existingFixtureEvents);
  }

  const fixtureEvents = await getOrbitEvents({
    entityID: simulatorSmokeTaskID,
  });
  assertExactSimulatorFixtureEvent(fixtureEvents);

  console.log(
    [
      "Simulator fixture seeded and verified.",
      `Sign in: ${simulatorFixtureCredentials.email} / ${simulatorFixtureCredentials.password}`,
      "Next: use a clean Orbit install, then run `bun --cwd packages/app ios` from the repo root.",
      "Use a Debug build; Release and Archive builds route to production.",
      "Safe to rerun only before reviewing the smoke card; restart the imported suite afterward.",
    ].join("\n"),
  );
}

if (import.meta.main) {
  seedSimulator().catch((error) => {
    console.error(
      `seed:simulator failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
