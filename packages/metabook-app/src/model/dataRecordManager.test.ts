import OrbitAPIClient from "@withorbit/api-client";
import {
  Attachment,
  AttachmentID,
  AttachmentMimeType,
  AttachmentURLReference,
  getIDForPrompt,
  imageAttachmentType,
  Prompt,
  PromptID,
} from "@withorbit/core";
import { testApplicationPrompt, testQAPrompt } from "@withorbit/sample-data";
import DataRecordManager, {
  DataRecordClientFileStore,
} from "./dataRecordManager";
import DataRecordStore from "./dataRecordStore";

jest.mock("@withorbit/api-client");
const mockedOrbitAPIClient = OrbitAPIClient as jest.MockedClass<
  typeof OrbitAPIClient
>;

let apiClient: jest.Mocked<typeof OrbitAPIClient["prototype"]>;
let dataRecordStore: DataRecordStore;
let testQAPromptID: PromptID;
beforeEach(async () => {
  mockedOrbitAPIClient.mockClear();
  apiClient = new mockedOrbitAPIClient(async () => ({
    personalAccessToken: "token",
  }));
  dataRecordStore = new DataRecordStore();
  testQAPromptID = await getIDForPrompt(testQAPrompt);
});

afterEach(async () => {
  await dataRecordStore.clear();
  await dataRecordStore.close();
});

describe("prompts", () => {
  test("fetches cached prompts", async () => {
    const client = new DataRecordManager(
      apiClient,
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    await dataRecordStore.savePrompt(testQAPromptID, testQAPrompt);
    const prompts = await client.getPrompts(new Set([testQAPromptID]));
    expect(prompts).toMatchObject(new Map([[testQAPromptID, testQAPrompt]]));
  });

  test("leaves unknown prompts undefined", async () => {
    apiClient.getTaskData.mockResolvedValue({
      hasMore: false,
      data: [],
      objectType: "list",
    });
    const client = new DataRecordManager(
      apiClient,
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testQAPromptID]));
    expect(prompts).toMatchObject(new Map());
  });

  test("fetches source prompts when necessary", async () => {
    const client = new DataRecordManager(
      new MockDataClient({ [testQAPromptID]: testQAPrompt }),
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testQAPromptID]));
    expect(prompts).toMatchObject(new Map([[testQAPromptID, testQAPrompt]]));

    expect(await dataRecordStore.getPrompt(testQAPromptID)).toMatchObject(
      testQAPrompt,
    );
  });

  test("mixes local and remote data", async () => {
    const client = new DataRecordManager(
      new MockDataClient({ [testQAPromptID]: testQAPrompt }),
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    await dataRecordStore.savePrompt("x" as PromptID, testApplicationPrompt);
    const prompts = await client.getPrompts(
      new Set([testQAPromptID, "x" as PromptID]),
    );
    expect(prompts).toMatchObject(
      new Map<PromptID, Prompt>([
        [testQAPromptID, testQAPrompt],
        ["x" as PromptID, testApplicationPrompt],
      ]),
    );
  });
});

describe("attachments", () => {
  const testAttachmentID = "x" as AttachmentID;
  const testAttachmentReference = {
    type: imageAttachmentType,
    url: "url",
  } as AttachmentURLReference;

  test("fetches attachments when present on-disk", async () => {
    const client = new DataRecordManager(
      {} as MetabookDataClient,
      dataRecordStore,
      {
        storedURLExists: async (url) => url === "url",
      } as DataRecordClientFileStore,
    );
    await dataRecordStore.saveAttachmentURLReference(
      testAttachmentID,
      testAttachmentReference,
    );
    const attachments = await client.getAttachments(
      new Set([testAttachmentID]),
    );
    expect(attachments).toMatchObject(
      new Map([[testAttachmentID, testAttachmentReference]]),
    );
  });

  test("doesn't return cached attachments which are missing on-disk", async () => {
    const client = new DataRecordManager(
      new MockDataClient({}),
      dataRecordStore,
      {
        storeFileFromURL: jest.fn(),
        storedURLExists: async (url) => false,
      } as DataRecordClientFileStore,
    );
    await dataRecordStore.saveAttachmentURLReference(
      testAttachmentID,
      testAttachmentReference,
    );
    const attachments = await client.getAttachments(
      new Set([testAttachmentID]),
    );
    expect(attachments).toMatchObject(new Map());
  });

  test("writes cached attachments to disk", async () => {
    const writeMock = jest.fn();
    writeMock.mockResolvedValue({ url: "url", type: imageAttachmentType });
    const client = new DataRecordManager(
      new MockDataClient({
        [testAttachmentID]: {
          type: imageAttachmentType,
          mimeType: AttachmentMimeType.PNG,
          contents: Buffer.from("foo"),
        } as Attachment,
      }),
      dataRecordStore,
      {
        storeFileFromURL: writeMock,
        storedURLExists: () => Promise.resolve(false),
      },
    );

    const attachments = await client.getAttachments(
      new Set([testAttachmentID]),
    );
    expect(writeMock.mock.calls[0][0]).toEqual(testAttachmentID);
    expect(writeMock.mock.calls[0][1]).toEqual(testAttachmentID);

    expect(attachments).toMatchObject(
      new Map([[testAttachmentID, testAttachmentReference]]),
    );

    expect(
      await dataRecordStore.getAttachmentURLReference(testAttachmentID),
    ).toMatchObject(testAttachmentReference);
  });
});

describe("has finished initial import flag", () => {
  test("starts false", async () => {
    expect(await dataRecordStore.getHasFinishedInitialImport()).toEqual(false);
  });

  test("round trips", async () => {
    await dataRecordStore.setHasFinishedInitialImport();
    expect(await dataRecordStore.getHasFinishedInitialImport()).toEqual(true);
  });
});
