import * as IT from "incremental-thinking";
import {
  PromptUpdateMetadataActionLog,
  updateMetadataActionLogType,
} from "metabook-core";
import { notePrompts } from "spaced-everything";
import { testClozePrompt } from "metabook-sample-data";
import { simpleOrbitPrompt } from "./__fixtures__/testData";
import SpacedEverythingImportCache from "./importCache";
import { getUpdatesForTaskCacheChange } from "./taskCache";
import { getITPromptForOrbitPrompt } from "./util/cstOrbitAdapters";

const clozeITPrompt = getITPromptForOrbitPrompt(
  testClozePrompt,
) as IT.ClozePrompt;

describe("getUpdatesForTaskCacheChange", () => {
  test("insert qa prompt", async () => {
    const mock = {} as SpacedEverythingImportCache;
    mock.getPromptRecordByCSTID = jest.fn().mockResolvedValue(null);
    const { prompts, logs } = await getUpdatesForTaskCacheChange(
      {
        type: "insert",
        record: {
          type: "task",
          value: {
            type: "qaPrompt",
            prompt: getITPromptForOrbitPrompt(simpleOrbitPrompt) as IT.QAPrompt,
            noteData: {
              noteTitle: "test-title",
              modificationTimestamp: 0,
              externalNoteID: {
                type: "test-type",
                id: "test-id",
                openURL: "test-url",
              },
            },
          },
        },
        path: ["container", "id"],
      },
      500,
      mock,
    );

    expect(prompts[0]).toMatchObject(simpleOrbitPrompt);
    expect(logs).toHaveLength(1);
  });

  test("insert cloze prompt", async () => {
    const mock = {} as SpacedEverythingImportCache;
    mock.getPromptRecordByCSTID = jest.fn().mockResolvedValue(null);
    const { prompts, logs } = await getUpdatesForTaskCacheChange(
      {
        type: "insert",
        record: {
          type: "collection",
          value: {
            type: "clozeBlock",
            prompt: clozeITPrompt,
            noteData: {
              noteTitle: "test-title",
              modificationTimestamp: 0,
              externalNoteID: {
                type: "test-type",
                id: "test-id",
                openURL: "test-url",
              },
            },
          },
          childIDs: notePrompts.getClozeNoteTaskCollectionChildIDsForClozePrompt(
            clozeITPrompt,
          ),
        },
        path: ["container", "id"],
      },
      500,
      mock,
    );

    expect(prompts[0]).toMatchObject(testClozePrompt);
    expect(logs).toHaveLength(5);
  });

  test("delete prompt", async () => {
    const mock = {} as SpacedEverythingImportCache;
    mock.getPromptRecordByCSTID = jest.fn().mockResolvedValue({
      ITPrompt: clozeITPrompt,
      headActionLogIDs: ["parent-log"],
    });
    const { prompts, logs } = await getUpdatesForTaskCacheChange(
      {
        type: "delete",
        path: ["container", "id"],
      },
      500,
      (mock as unknown) as SpacedEverythingImportCache,
    );

    expect(prompts).toHaveLength(0);
    expect(logs).toHaveLength(5);
    expect(logs[0]).toMatchObject({
      actionLogType: updateMetadataActionLogType,
      updates: { isDeleted: true },
      parentActionLogIDs: ["parent-log"],
    });
  });

  test("delete note", async () => {
    const mock = {} as SpacedEverythingImportCache;
    mock.getPromptRecordByCSTID = jest.fn().mockResolvedValue({
      ITPrompt: clozeITPrompt,
      headActionLogIDs: ["parent-log"],
    });
    mock.getNoteMetadata = jest.fn().mockResolvedValue({
      childIDs: ["childA", "childB"],
      metadata: {},
    });
    const { prompts, logs } = await getUpdatesForTaskCacheChange(
      {
        type: "delete",
        path: ["container"],
      },
      500,
      (mock as unknown) as SpacedEverythingImportCache,
    );

    expect(prompts).toHaveLength(0);
    expect(logs).toHaveLength(10);
    expect(mock.getPromptRecordByCSTID).toHaveBeenCalledTimes(2);
    expect(mock.getPromptRecordByCSTID).toHaveBeenLastCalledWith("childB");
    expect(logs[0]).toMatchObject({
      actionLogType: updateMetadataActionLogType,
      updates: { isDeleted: true },
    });
    expect(
      (logs[0] as PromptUpdateMetadataActionLog).parentActionLogIDs,
    ).toMatchObject(["parent-log"]);
  });

  test("update note metadata", async () => {
    const mock = {} as SpacedEverythingImportCache;
    mock.getPromptRecordByCSTID = jest.fn().mockResolvedValue({
      ITPrompt: clozeITPrompt,
      headActionLogIDs: ["parent-log"],
    });
    mock.getNoteMetadata = jest.fn().mockResolvedValue({
      childIDs: ["childA", "childB"],
      metadata: {
        title: "old-title",
        modificationTimestamp: 0,
        URL: "old-url",
      },
    });
    const { prompts, logs } = await getUpdatesForTaskCacheChange(
      {
        type: "update",
        path: ["container"],
        record: {
          type: "collection",
          value: {
            type: "note",
            externalNoteID: {
              type: "test-type",
              openURL: "new-url",
              id: "test-id",
            },
            noteTitle: "new-title",
            modificationTimestamp: 1,
          },
          childIDs: new Set(["childA", "childB"]),
        },
      },
      500,
      (mock as unknown) as SpacedEverythingImportCache,
    );

    expect(prompts).toHaveLength(0);
    expect(logs).toHaveLength(10);
    const log = logs[0] as PromptUpdateMetadataActionLog;
    expect(log.parentActionLogIDs).toMatchObject(["parent-log"]);
    expect(log.updates.provenance!.title).toEqual("new-title");
    expect(log.updates.provenance!.url).toEqual("new-url");
  });
});
