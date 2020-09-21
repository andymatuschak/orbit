import {
  AnkiPromptProvenance,
  basicPromptType,
  getActionLogFromPromptActionLog,
  getIDForActionLog,
  PromptIngestActionLog,
  PromptRepetitionOutcome,
  RescheduleActionLog,
} from "metabook-core";
import { testBasicPrompt, testClozePrompt } from "metabook-sample-data";
import {
  testCard,
  testCollection,
  testLog,
  testNote,
} from "./__fixtures__/testAnkiData";
import withTestAnkiCollection from "./__fixtures__/withTestAnkiCollection";
import { CardQueue, Collection } from "./ankiPkg";
import {
  createImportPlan,
  createPlanForCard,
  createPlanForLog,
  createPlanForNote,
  createRescheduleLogForCard,
  extractPromptTaskIDForCard,
} from "./importPlan";
import { ModelMapping } from "./modelMapping";

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

test("create plan for card", async () => {
  const log = (await createPlanForCard(
    testCard,
    testBasicPrompt,
    null,
  )) as PromptIngestActionLog;
  expect((log.provenance as AnkiPromptProvenance).externalID).toEqual(
    testCard.id.toString(),
  );
});

test("create plan for log", async () => {
  const ingestLog = (await createPlanForCard(
    testCard,
    testBasicPrompt,
    null,
  )) as PromptIngestActionLog;
  const log = createPlanForLog(testLog, ingestLog);
  expect(log.parentActionLogIDs).toEqual([
    getIDForActionLog(getActionLogFromPromptActionLog(ingestLog)),
  ]);
  expect(log.outcome).toEqual(PromptRepetitionOutcome.Remembered);
});

describe("reschedule logs", () => {
  let ingestLog: PromptIngestActionLog;
  beforeAll(async () => {
    ingestLog = (await createPlanForCard(
      testCard,
      testBasicPrompt,
      null,
    )) as PromptIngestActionLog;
  });

  test("learning card", () => {
    expect(
      (createRescheduleLogForCard(
        { ...testCard, queue: CardQueue.Learning, due: 1e5 },
        testCollection,
        ingestLog,
      ) as RescheduleActionLog).newTimestampMillis,
    ).toEqual(1e8);
  });

  test("due card", () => {
    expect(
      (createRescheduleLogForCard(
        { ...testCard, queue: CardQueue.Due, due: 50 },
        { ...testCollection, crt: 1000 },
        ingestLog,
      ) as RescheduleActionLog).newTimestampMillis,
    ).toEqual(1000 * 1000 + 50 * 1000 * 60 * 60 * 24);
  });
});

test("imports full database", async () => {
  const plan = await withTestAnkiCollection(createImportPlan);
  expect(plan.prompts.length).toBeGreaterThan(0);
  expect(plan.logs.length).toBeGreaterThan(0);
  expect(plan.attachments.length).toBeGreaterThan(0);
});
