import {
  EventType,
  mainTaskComponentID,
  TaskContentType,
  TaskID,
  TaskRescheduleEvent,
} from "@withorbit/core";
import {
  testCard,
  testCollection,
  testNote,
} from "./__fixtures__/testAnkiData.js";
import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection.js";
import { CardQueue, Collection } from "./ankiPkg/index.js";
import {
  createImportPlan,
  createRescheduleEventForCard,
  createSpecForNote,
  getComponentID,
} from "./importPlan.js";
import { ModelMapping } from "./modelMapping.js";

describe("createSpecForNote", () => {
  const cache: { [p: number]: ModelMapping } = {};
  const result = createSpecForNote(testNote, testCollection, cache);
  if (result instanceof Error) {
    fail();
  }
  const { spec } = result;
  test("uncached model", () => {
    expect(spec.content.type).toEqual(TaskContentType.QA);
    expect(cache[testNote.mid]).toBeTruthy();
  });
  test("cached model", () => {
    const secondResult = createSpecForNote(testNote, {} as Collection, cache);
    if (secondResult instanceof Error) {
      fail();
    }
    expect(result.spec).toEqual(spec);
  });

  test("unknown model", () => {
    expect(
      createSpecForNote({ ...testNote, mid: 51035 }, testCollection, cache),
    ).toBeInstanceOf(Error);
  });
});

describe("getComponentID", () => {
  test("cloze prompts use their ord index", () => {
    expect(
      getComponentID({ ...testCard, ord: 5 }, TaskContentType.Cloze),
    ).toEqual("5");
  });

  test("qa prompts use the main component ID", () => {
    expect(getComponentID({ ...testCard, ord: 0 }, TaskContentType.QA)).toEqual(
      mainTaskComponentID,
    );
  });

  test("reverse qa prompts have a null component ID", () => {
    expect(
      getComponentID({ ...testCard, ord: 1 }, TaskContentType.QA),
    ).toBeNull();
  });
});

describe("reschedule logs", () => {
  test("learning card", async () => {
    expect(
      (
        createRescheduleEventForCard(
          { ...testCard, queue: CardQueue.Learning, due: 1e5 },
          testCollection,
          "taskID" as TaskID,
          "cid",
        ) as TaskRescheduleEvent
      ).newDueTimestampMillis,
    ).toEqual(1e8);
  });

  test("due card", async () => {
    expect(
      (
        createRescheduleEventForCard(
          { ...testCard, queue: CardQueue.Due, due: 50 },
          { ...testCollection, crt: 1000 },
          "taskID" as TaskID,
          "cid",
        ) as TaskRescheduleEvent
      ).newDueTimestampMillis,
    ).toEqual(1000 * 1000 + 50 * 1000 * 60 * 60 * 24);
  });
});

test("imports full database", async () => {
  const plan = await withTestAnkiCollection(createImportPlan);
  expect(
    plan.events.filter(({ type }) => type === EventType.AttachmentIngest)
      .length,
  ).toBe(2);
  expect(
    plan.events.filter(({ type }) => type === EventType.TaskIngest).length,
  ).toBe(4);
  expect(
    plan.events.filter(({ type }) => type === EventType.TaskRepetition).length,
  ).toBe(1);
  expect(
    plan.events.filter(({ type }) => type === EventType.TaskReschedule).length,
  ).toBe(1);
  expect(plan.attachments.length).toBe(2);
});
