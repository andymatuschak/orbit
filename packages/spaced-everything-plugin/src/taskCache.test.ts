import * as IT from "incremental-thinking";
import { notePrompts } from "spaced-everything";
import { testClozePrompt } from "metabook-sample-data";
import { simpleOrbitPrompt } from "./__fixtures__/testData";
import { getUpdatesForTaskCacheChange } from "./taskCache";
import { getITPromptForOrbitPrompt } from "./util/cstOrbitAdapters";

describe("getUpdatesForTaskCacheChange", () => {
  test("insert basic prompt", () => {
    const { prompts, logs } = getUpdatesForTaskCacheChange(
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
      () => null,
    );

    expect(prompts[0]).toMatchObject(simpleOrbitPrompt);
    expect(logs).toHaveLength(1);
  });

  test("insert cloze prompt", () => {
    const clozePrompt = getITPromptForOrbitPrompt(
      testClozePrompt,
    ) as IT.ClozePrompt;
    const { prompts, logs } = getUpdatesForTaskCacheChange(
      {
        type: "insert",
        record: {
          type: "collection",
          value: {
            type: "clozeBlock",
            prompt: clozePrompt,
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
            clozePrompt,
          ),
        },
        path: ["container", "id"],
      },
      500,
      () => null,
    );

    expect(prompts[0]).toMatchObject(testClozePrompt);
    expect(logs).toHaveLength(5);
  });
});
