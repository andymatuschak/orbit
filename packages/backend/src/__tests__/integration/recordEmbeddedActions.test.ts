import {
  ActionLog,
  getIDForPromptSync,
  getIDForPromptTask,
} from "@withorbit/core";
import { testQAPrompt } from "@withorbit/sample-data";
import { resetLocalEmulators } from "../emulators";
import { fetchRoute } from "./utils/fetchRoute";
import { setupAuthToken } from "./utils/setupAuthToken";

const testPromptID = getIDForPromptSync(testQAPrompt);
const testActionLog: ActionLog = {
  timestampMillis: 15,
  taskID: getIDForPromptTask({
    promptID: testPromptID,
    promptType: testQAPrompt.promptType,
    promptParameters: null,
  }),
  actionLogType: "ingest",
  provenance: null,
};

afterEach(async () => {
  await resetLocalEmulators();
});

describe("core2 migration", () => {
  it("writes events for logs", async () => {
    await setupAuthToken("migrate-actions");
    const { status: recordActionsStatus, body: recordActionsBody } =
      await fetchRoute(`/api/internal/recordEmbeddedActions`, {
        method: "POST",
        json: {
          logs: [testActionLog],
          promptsByID: { [testPromptID]: testQAPrompt },
        },
        authorization: { token: "migrate-actions" },
      });
    expect(recordActionsStatus).toBe(204);
    expect(recordActionsBody).toBeUndefined();

    const { status: eventsGetStatus, body: eventsGetBody } = await fetchRoute(
      "/api/2/events",
      {
        method: "GET",
        authorization: { token: "migrate-actions" },
      },
    );
    expect(eventsGetStatus).toBe(200);
    expect(eventsGetBody.items.length).toBe(1);
    expect(eventsGetBody.items[0].entityID).toEqual(testPromptID);
  });
});
