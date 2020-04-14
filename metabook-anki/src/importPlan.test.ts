import {
  AnkiPromptProvenance,
  basicPromptType,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  PromptIngestActionLog,
  PromptRepetitionOutcome,
} from "metabook-core";
import { testBasicPrompt, testClozePrompt } from "metabook-sample-data";
import {
  testCard,
  testCollection,
  testLog,
  testNote,
} from "./__fixtures__/testAnkiData";
import { Collection } from "./ankiPkg";
import {
  createPlanForCard,
  createPlanForLog,
  createPlanForNote,
  extractPromptTaskIDForCard,
  createImportPlan,
} from "./importPlan";
import { ModelMapping } from "./modelMapping";
import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection";

describe("createPlanForNote", () => {
  const cache: { [p: number]: ModelMapping } = {};
  const result = createPlanForNote(testNote, testCollection, new Map(), cache);
  if (result instanceof Error) {
    fail();
  }
  const { prompt } = result;
  test("uncached model", () => {
    expect(prompt.promptType).toEqual(basicPromptType);
    expect(cache[testNote.mid]).toBeTruthy();
  });
  test("cached model", () => {
    const secondResult = createPlanForNote(
      testNote,
      {} as Collection,
      new Map(),
      cache,
    );
    if (secondResult instanceof Error) {
      fail();
    }
    expect(result.prompt).toEqual(prompt);
  });

  test("unknown model", () => {
    expect(
      createPlanForNote(
        { ...testNote, mid: 51035 },
        testCollection,
        new Map(),
        cache,
      ),
    ).toBeInstanceOf(Error);
  });
});

describe("extract prompt task ID for card", () => {
  test("cloze prompts include their IDs", () => {
    const basicTaskID = expect(
      extractPromptTaskIDForCard(testCard, testBasicPrompt),
    );
    const clozeTaskID = expect(
      extractPromptTaskIDForCard({ ...testCard, ord: 5 }, testClozePrompt),
    );
    expect(basicTaskID).not.toEqual(clozeTaskID);
  });
});

test("create plan for card", () => {
  const log = createPlanForCard(
    testCard,
    testBasicPrompt,
  ) as PromptIngestActionLog;
  expect((log.provenance as AnkiPromptProvenance).cardID).toEqual(testCard.id);
});

test("create plan for log", () => {
  const ingestLog = createPlanForCard(
    testCard,
    testBasicPrompt,
  ) as PromptIngestActionLog;
  const log = createPlanForLog(testLog, ingestLog);
  expect(log.parentActionLogIDs).toEqual([
    getIDForActionLog(getActionLogFromPromptActionLog(ingestLog)),
  ]);
  expect(log.outcome).toEqual(PromptRepetitionOutcome.Remembered);
});

test("imports full database", async () => {
  const plan = await withTestAnkiCollection(createImportPlan);
  expect(plan.prompts.length).toBeGreaterThan(0);
  expect(plan.logs.length).toBeGreaterThan(0);
  expect(plan.attachments.length).toBeGreaterThan(0);
});
