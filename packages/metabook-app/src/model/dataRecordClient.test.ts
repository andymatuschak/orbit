import shimFirebasePersistence from "firebase-node-persistence-shim";
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
import DataRecordStore from "./dataRecordStore";
import DataRecordClient, {
  DataRecordClientFileStore,
} from "./dataRecordClient";

beforeAll(() => {
  shimFirebasePersistence();
});

class MockDataClient implements MetabookDataClient {
  private testData: { [key: string]: unknown };
  constructor(testData: { [key: string]: unknown }) {
    this.testData = testData;
  }

  async getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<(Attachment | null)[]> {
    return [...attachmentIDs].map((id) => this.testData[id]) as Attachment[];
  }

  async getPrompts(promptIDs: Iterable<PromptID>): Promise<(Prompt | null)[]> {
    return [...promptIDs].map((id) => this.testData[id]) as Prompt[];
  }

  recordAttachments(attachments: Attachment[]): Promise<unknown> {
    throw new Error("Unimplemented");
  }

  recordPrompts(prompts: Prompt[]): Promise<unknown> {
    throw new Error("Unimplemented");
  }
}

let cache: DataRecordStore;
const testBasicPromptID = getIDForPrompt(testBasicPrompt);
beforeEach(() => {
  cache = new DataRecordStore();
});

afterEach(async () => {
  await cache.clear();
  await cache.close();
});

describe("prompts", () => {
  test("fetches cached prompts", async () => {
    const client = new DataRecordClient(
      {} as MetabookDataClient,
      cache,
      {} as DataRecordClientFileStore,
    );
    await cache.savePrompt(testBasicPromptID, testBasicPrompt);
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(
      new Map([[testBasicPromptID, testBasicPrompt]]),
    );
  });

  test("leaves unknown prompts undefined", async () => {
    const client = new DataRecordClient(
      new MockDataClient({}),
      cache,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(new Map());
  });

  test("fetches source prompts when necessary", async () => {
    const client = new DataRecordClient(
      new MockDataClient({ [testBasicPromptID]: testBasicPrompt }),
      cache,
      {} as DataRecordClientFileStore,
    );
    const prompts = await client.getPrompts(new Set([testBasicPromptID]));
    expect(prompts).toMatchObject(
      new Map([[testBasicPromptID, testBasicPrompt]]),
    );

    expect(await cache.getPrompt(testBasicPromptID)).toMatchObject(
      testBasicPrompt,
    );
  });

  test("mixes local and remote data", async () => {
    const client = new DataRecordClient(
      new MockDataClient({ [testBasicPromptID]: testBasicPrompt }),
      cache,
      {} as DataRecordClientFileStore,
    );
    await cache.savePrompt("x" as PromptID, testApplicationPrompt);
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
    const client = new DataRecordClient({} as MetabookDataClient, cache, {
      fileExistsAtURL: async (url) => url === "url",
    } as DataRecordClientFileStore);
    await cache.saveAttachmentURLReference(
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
    const client = new DataRecordClient(new MockDataClient({}), cache, {
      fileExistsAtURL: async (url) => false,
    } as DataRecordClientFileStore);
    await cache.saveAttachmentURLReference(
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
    const client = new DataRecordClient(
      new MockDataClient({
        [testAttachmentID]: {
          type: imageAttachmentType,
          mimeType: AttachmentMimeType.PNG,
          contents: "foo",
        } as Attachment,
      }),
      cache,
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
      await cache.getAttachmentURLReference(testAttachmentID),
    ).toMatchObject(testAttachmentReference);
  });
});
