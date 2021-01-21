import {
  AttachmentID,
  AttachmentIDReference,
  getIDForPromptTask,
  Prompt,
  PromptID,
  PromptState,
  PromptTaskID,
  qaPromptType,
} from "metabook-core";
import { testQAPrompt } from "metabook-sample-data";
import DataRecordManager from "./dataRecordManager";
import promptDataInitialImportOperation from "./promptDataInitialImportOperation";
import PromptStateStore from "./promptStateStore";

const dataRecordClient = {} as DataRecordManager;
const promptStateStore = {} as PromptStateStore;

afterEach(() => {
  jest.clearAllMocks();
});

test("basic run", async () => {
  promptStateStore.getAllPromptStates = jest
    .fn()
    .mockImplementation(async () => {
      promptStateStore.getAllPromptStates = jest
        .fn()
        .mockResolvedValue(new Map());
      return new Map<PromptTaskID, PromptState>([
        [
          getIDForPromptTask({
            promptID: "x" as PromptID,
            promptParameters: null,
            promptType: qaPromptType,
          }),
          {} as PromptState,
        ],
      ]);
    });

  dataRecordClient.getPrompts = jest.fn().mockResolvedValue(
    new Map<PromptID, Prompt>([
      [
        "x" as PromptID,
        {
          ...testQAPrompt,
          question: {
            ...testQAPrompt.question,
            attachments: [
              {
                id: "test-attachment" as AttachmentID,
              } as AttachmentIDReference,
            ],
          },
        },
      ],
    ]),
  );

  dataRecordClient.getAttachments = jest
    .fn()
    .mockResolvedValue(new Map([["test-attachment", {}]]));

  await promptDataInitialImportOperation(dataRecordClient, promptStateStore)
    .promise;
  expect(dataRecordClient.getPrompts).toHaveBeenCalledTimes(1);
  expect(dataRecordClient.getAttachments).toHaveBeenCalledTimes(1);
});
