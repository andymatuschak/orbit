import { MetabookDataClient } from "metabook-client";
import {
  Attachment,
  AttachmentID,
  AttachmentMimeType,
  AttachmentURLReference,
  getIDForPrompt,
  imageAttachmentType,
  Prompt,
  PromptID,
} from "metabook-core";
import { testApplicationPrompt, testBasicPrompt } from "metabook-sample-data";
import dataRecordClient from "./dataRecordManager";
import DataRecordStore from "./dataRecordStore";
import DataRecordManager, {
  DataRecordClientFileStore,
} from "./dataRecordManager";

class MockDataClient implements MetabookDataClient {
  private testData: { [key: string]: unknown };
  constructor(testData: { [key: string]: unknown }) {
    this.testData = testData;
  }

  async getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<Map<AttachmentID, Attachment | null>> {
    return new Map(
      [...attachmentIDs].map((id) => [id, this.testData[id] as Attachment]),
    );
  }

  async getPrompts(
    promptIDs: Iterable<PromptID>,
  ): Promise<Map<PromptID, Prompt | null>> {
    return new Map(
      [...promptIDs].map((id) => [id, this.testData[id] as Prompt]),
    );
  }

  recordAttachments(attachments: Attachment[]): Promise<unknown> {
    throw new Error("Unimplemented");
  }

  recordPrompts(prompts: Prompt[]): Promise<unknown> {
    throw new Error("Unimplemented");
  }
}

let dataRecordStore: DataRecordStore;
const testBasicPromptID = getIDForPrompt(testBasicPrompt);
beforeEach(() => {
  dataRecordStore = new DataRecordStore();
});

afterEach(async () => {
  await dataRecordStore.clear();
  await dataRecordStore.close();
});

describe("prompts", () => {
  test("fetches cached prompts", async () => {
    const client = new DataRecordManager(
      {} as MetabookDataClient,
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    await dataRecordStore.savePrompt(testBasicPromptID, testBasicPrompt);
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(
      new Map([[testBasicPromptID, testBasicPrompt]]),
    );
  });

  test("leaves unknown prompts undefined", async () => {
    const client = new DataRecordManager(
      new MockDataClient({}),
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(new Map());
  });

  test("fetches source prompts when necessary", async () => {
    const client = new DataRecordManager(
      new MockDataClient({ [testBasicPromptID]: testBasicPrompt }),
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(
      new Map([[testBasicPromptID, testBasicPrompt]]),
    );

    expect(await dataRecordStore.getPrompt(testBasicPromptID)).toMatchObject(
      testBasicPrompt,
    );
  });

  test("mixes local and remote data", async () => {
    const client = new DataRecordManager(
      new MockDataClient({ [testBasicPromptID]: testBasicPrompt }),
      dataRecordStore,
      {} as DataRecordClientFileStore,
    );
    await dataRecordStore.savePrompt("x" as PromptID, testApplicationPrompt);
    const prompts = await client.getPrompts(
      new Set([testBasicPromptID, "x" as PromptID]),
    );
    expect(prompts).toMatchObject(
      new Map<PromptID, Prompt>([
        [testBasicPromptID, testBasicPrompt],
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
        fileExistsAtURL: async (url) => url === "url",
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
        fileExistsAtURL: async (url) => false,
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
    writeMock.mockResolvedValue("url");
    const client = new DataRecordManager(
      new MockDataClient({
        [testAttachmentID]: {
          type: imageAttachmentType,
          mimeType: AttachmentMimeType.PNG,
          contents: "foo",
        } as Attachment,
      }),
      dataRecordStore,
      ({
        writeFile: writeMock,
      } as unknown) as DataRecordClientFileStore,
    );

    const attachments = await client.getAttachments(
      new Set([testAttachmentID]),
    );
    expect(writeMock.mock.calls[0][0]).toEqual(`${testAttachmentID}.png`);
    expect(writeMock.mock.calls[0][1].toString()).toEqual("foo");

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
