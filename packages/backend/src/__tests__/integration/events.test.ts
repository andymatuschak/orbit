import { createTestTaskIngestEvents } from "@withorbit/sample-data";
import { resetLocalEmulators } from "../emulators.js";
import { setupAuthToken } from "../firebaseTesting.js";
import { fetchRoute } from "./utils/fetchRoute.js";

beforeEach(async () => {
  await resetLocalEmulators();
  await setupAuthToken("test");
});

test("round-trip request", async () => {
  const testEvents = createTestTaskIngestEvents(100);
  const { status: patchStatus, body: patchBody } = await fetchRoute(
    `/api/events`,
    {
      method: "PATCH",
      json: testEvents,
      authorization: { token: "test" },
    },
  );
  expect(patchStatus).toBe(204);
  expect(patchBody).toBeUndefined();

  const { status: getStatus, body: getBody } = await fetchRoute(
    `/api/events?limit=100`,
    {
      method: "GET",
      authorization: { token: "test" },
    },
  );
  expect(getStatus).toBe(200);
  expect(getBody).toMatchObject({
    type: "list",
    hasMore: false,
    items: testEvents,
  });
});

describe("[GET] validation", () => {
  it("succeeds with valid parameters", async () => {
    const testEvents = createTestTaskIngestEvents(5);
    await fetchRoute(`/api/events`, {
      method: "PATCH",
      json: testEvents,
      authorization: { token: "test" },
    });

    const { status } = await fetchRoute(
      `/api/events?afterID=${testEvents[1].id}&limit=1000`,
      { method: "GET", authorization: { token: "test" } },
    );
    expect(status).toBe(200);
  });

  it("it does not allow limit to be a negative integer", async () => {
    const request = await fetchRoute(`/api/events?limit=-5`, {
      method: "GET",
      authorization: { token: "test" },
    });
    expect(request.status).toBe(400);
    expect(request.body.errors).toMatchObject([
      {
        message: "query/limit must be >= 1",
      },
    ]);
  });

  it("it does not allow limit to be a floating point", async () => {
    const request = await fetchRoute(`/api/events?limit=1.5`, {
      method: "GET",
      authorization: { token: "test" },
    });
    expect(request.status).toBe(400);
    expect(request.body.errors).toMatchObject([
      {
        message: "query/limit must be integer",
      },
    ]);
  });
});

describe("[PATCH] validation", () => {
  it("it fails when extra properties are provided", async () => {
    const ingestEvent = createTestTaskIngestEvents(1)[0];
    const { status, body } = await fetchRoute(`/api/events`, {
      method: "PATCH",
      authorization: { token: "test" },
      json: [
        {
          ...ingestEvent,
          someExtraProperty: true,
        },
      ],
    });
    expect(status).toBe(400);
    expect(
      body.errors.includes(
        (e: Error) =>
          e.message === "body/0 must NOT have additional properties",
      ),
    );
  });

  it("it fails when actionLogType is invalid", async () => {
    const { status, body } = await fetchRoute(`/api/events`, {
      method: "PATCH",
      authorization: { token: "test" },
      json: [
        {
          ...createTestTaskIngestEvents(1)[0],
          type: "invalid",
        },
      ],
    });
    expect(status).toBe(400);
    expect(
      body.errors.includes(
        (e: Error) =>
          e.message ===
          "body/0/type must be equal to one of the allowed values",
      ),
    );
  });
});
