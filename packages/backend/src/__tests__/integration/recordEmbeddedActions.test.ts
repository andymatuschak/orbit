import {
  ActionLog,
  Attachment,
  AttachmentMimeType,
  getIDForAttachment,
  getIDForPromptSync,
  getIDForPromptTask,
  imageAttachmentType,
  QAPrompt,
} from "@withorbit/core";
import { AttachmentIngestEvent, EventType, migration } from "@withorbit/core2";
import { testQAPrompt } from "@withorbit/sample-data";
import { resetLocalEmulators } from "../emulators";
import { fetchRoute } from "./utils/fetchRoute";
import {
  setupAuthToken,
  setupTestOrbitAPIClient,
} from "./utils/setupAuthToken";

afterEach(async () => {
  await resetLocalEmulators();
});

describe("core2 migration", () => {
  it("writes events and attachments for ingested prompt with attachment", async () => {
    // Prepare a prompt with an attachment.
    const testAttachmentID = await getIDForAttachment(testAttachmentBytes);
    const testAttachmentPrompt: QAPrompt = {
      ...testQAPrompt,
      question: {
        contents: testQAPrompt.question.contents,
        attachments: [
          {
            type: imageAttachmentType,
            id: testAttachmentID,
            byteLength: testAttachmentBytes.length,
          },
        ],
      },
    };
    const testPromptID = getIDForPromptSync(testAttachmentPrompt);
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

    const apiClient = await setupTestOrbitAPIClient();
    await setupAuthToken("migrate-actions", {core2MigrationTimestampMillis: 1000});

    // Upload the attachment.
    await apiClient.storeAttachment(testAttachment);

    // Ingest the prompt.
    const { status: recordActionsStatus, body: recordActionsBody } =
      await fetchRoute(`/api/internal/recordEmbeddedActions`, {
        method: "POST",
        json: {
          logs: [testActionLog],
          promptsByID: { [testPromptID]: testAttachmentPrompt },
        },
        authorization: { token: "migrate-actions" },
      });
    expect(recordActionsStatus).toBe(204);
    expect(recordActionsBody).toBeUndefined();

    // Ensure core2 events are written for the ingest event.
    const { status: eventsGetStatus, body: eventsGetBody } = await fetchRoute(
      "/api/2/events",
      {
        method: "GET",
        authorization: { token: "migrate-actions" },
      },
    );
    expect(eventsGetStatus).toBe(200);
    expect(eventsGetBody.items.length).toBe(2);
    expect(eventsGetBody.items[0].type).toEqual(EventType.AttachmentIngest);
    const attachmentIngestEvent = eventsGetBody
      .items[0] as AttachmentIngestEvent;
    expect(attachmentIngestEvent.entityID).toEqual(
      migration.convertCore1ID(testAttachmentID),
    );
    expect(eventsGetBody.items[1].type).toEqual(EventType.TaskIngest);

    // Ensure that the attachment is migrated to core2 storage.
    const attachmentBlob = await apiClient.getAttachment2(
      attachmentIngestEvent.entityID,
    );
    expect(attachmentBlob.type).toEqual(testAttachment.mimeType);
    const attachmentBuffer = await attachmentBlob.arrayBuffer();
    expect(Buffer.from(attachmentBuffer).toString("base64")).toEqual(
      testAttachmentBase64Data,
    );
  });
});

const testAttachmentBase64Data =
  "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";
const testAttachmentBytes = Buffer.from(testAttachmentBase64Data, "base64");
const testAttachment: Attachment = {
  contents: testAttachmentBytes,
  mimeType: AttachmentMimeType.PNG,
  type: imageAttachmentType,
};
