import {
  EventType,
  TaskID,
  TaskIngestEvent,
  TaskProvenance,
  TaskUpdateDeletedEvent,
} from "@withorbit/core";
import * as IT from "incremental-thinking";
import * as spacedEverything from "spaced-everything";
import {
  simpleOrbitClozeTaskSpec,
  simpleOrbitQATaskSpec,
} from "./__fixtures__/testData";
import { getITPromptForOrbitTaskSpec } from "./cstOrbitAdapters";
import { getEventsForTaskCacheChange, ImportCache } from "./taskCache";

const clozeITPrompt = getITPromptForOrbitTaskSpec(
  simpleOrbitClozeTaskSpec,
) as IT.ClozePrompt;

describe("getUpdatesForTaskCacheChange", () => {
  test("insert qa prompt", async () => {
    const importCache: ImportCache = {
      taskIDsByCSTID: new Map(),
      ITPromptsByCSTID: new Map(),
      noteRecordsByNoteID: new Map(),
    };
    const events = await getEventsForTaskCacheChange(
      {
        type: "insert",
        record: {
          type: "task",
          value: {
            type: "qaPrompt",
            prompt: getITPromptForOrbitTaskSpec(
              simpleOrbitQATaskSpec,
            ) as IT.QAPrompt,
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
      importCache,
    );

    expect(events).toHaveLength(1);
    const ingestLog = events[0] as TaskIngestEvent;
    expect(ingestLog.type).toEqual(EventType.TaskIngest);
    expect(ingestLog.spec).toEqual(simpleOrbitQATaskSpec);
  });

  test("insert cloze prompt", async () => {
    const importCache: ImportCache = {
      taskIDsByCSTID: new Map(),
      ITPromptsByCSTID: new Map(),
      noteRecordsByNoteID: new Map(),
    };
    const events = await getEventsForTaskCacheChange(
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
          childIDs:
            spacedEverything.notePrompts.getClozeNoteTaskCollectionChildIDsForClozePrompt(
              clozeITPrompt,
            ),
        },
        path: ["container", "id"],
      },
      500,
      importCache,
    );

    expect(events).toHaveLength(1);
    const ingestLog = events[0] as TaskIngestEvent;
    expect(ingestLog.type).toEqual(EventType.TaskIngest);
    expect(ingestLog.spec).toEqual(simpleOrbitClozeTaskSpec);
  });

  test("delete prompt", async () => {
    const deletedTaskID = "a" as TaskID;
    const CSTID = spacedEverything.notePrompts.getIDForPrompt(clozeITPrompt);

    const importCache: ImportCache = {
      taskIDsByCSTID: new Map([[CSTID, deletedTaskID]]),
      ITPromptsByCSTID: new Map([[CSTID, clozeITPrompt]]),
      noteRecordsByNoteID: new Map([
        ["container", { childIDs: [CSTID], provenance: {} as TaskProvenance }],
      ]),
    };
    const events = await getEventsForTaskCacheChange(
      {
        type: "delete",
        path: ["container", CSTID],
      },
      500,
      importCache,
    );

    expect(events).toHaveLength(1);
    const event = events[0] as TaskUpdateDeletedEvent;
    expect(event.type).toEqual(EventType.TaskUpdateDeleted);
    expect(event.entityID).toEqual(deletedTaskID);
  });

  test("delete note", async () => {
    const CSTID = spacedEverything.notePrompts.getIDForPrompt(clozeITPrompt);

    const importCache: ImportCache = {
      taskIDsByCSTID: new Map([[CSTID, "a" as TaskID]]),
      ITPromptsByCSTID: new Map([[CSTID, clozeITPrompt]]),
      noteRecordsByNoteID: new Map([
        ["container", { childIDs: [CSTID], provenance: {} as TaskProvenance }],
      ]),
    };

    const events = await getEventsForTaskCacheChange(
      {
        type: "delete",
        path: ["container"],
      },
      500,
      importCache,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: EventType.TaskUpdateDeleted,
      isDeleted: true,
      entityID: "a" as TaskID,
    });
  });

  test("update note metadata", async () => {
    const CSTID = spacedEverything.notePrompts.getIDForPrompt(clozeITPrompt);

    const importCache: ImportCache = {
      taskIDsByCSTID: new Map([[CSTID, "a" as TaskID]]),
      ITPromptsByCSTID: new Map([[CSTID, clozeITPrompt]]),
      noteRecordsByNoteID: new Map([
        [
          "container",
          {
            childIDs: [CSTID],
            provenance: {
              identifier: "test-id",
              title: "old-title",
            } as TaskProvenance,
          },
        ],
      ]),
    };

    const events = await getEventsForTaskCacheChange(
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
          childIDs: new Set(["a"]),
        },
      },
      500,
      importCache,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: EventType.TaskUpdateProvenanceEvent,
      entityID: "a" as TaskID,
      provenance: {
        url: "new-url",
        identifier: "test-id",
        title: "new-title",
      },
    });
  });
});
