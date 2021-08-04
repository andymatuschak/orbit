import { resetLocalEmulators } from "../emulators";
import { fetchRoute } from "./utils/fetchRoute";
import { setupAuthToken } from "./utils/setupAuthToken";
import { core2 as fixtures } from "@withorbit/sample-data";

afterEach(async () => {
  await resetLocalEmulators();
});

test("round-trip request", async () => {
  await setupAuthToken("patch-events-round-trip");
  const testEvents = fixtures.createTestTaskIngestEvents(500, "test");
  const { status: patchStatus, body: patchBody } = await fetchRoute(
    `/api/2/events`,
    {
      method: "PATCH",
      json: testEvents,
      authorization: { token: "patch-events-round-trip" },
    },
  );
  expect(patchStatus).toBe(204);
  expect(patchBody).toBeUndefined();

  await setupAuthToken("get-events-round-trip");
  const { status: getStatus, body: getBody } = await fetchRoute(
    `/api/2/events?limit=500`,
    {
      method: "GET",
      authorization: { token: "get-events-round-trip" },
    },
  );
  expect(getStatus).toBe(200);
  expect(getBody).toMatchObject({
    type: "list",
    hasMore: false,
    items: testEvents,
  });
});
