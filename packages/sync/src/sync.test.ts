import {
  AttachmentID,
  AttachmentIngestEvent,
  AttachmentMIMEType,
  Event,
  EventID,
  EventType,
  TaskID,
  TaskIngestEvent,
} from "@withorbit/core2";
import { core2 as fixtures } from "@withorbit/sample-data";
import OrbitStoreFS from "@withorbit/store-fs";
import { OrbitStore } from "@withorbit/store-shared";
import jestFetchMock from "jest-fetch-mock";
import os from "os";
import path from "path";
import stream from "stream";
import { OrbitStoreSyncInterface } from "./orbitStoreSyncInterface";
import { syncOrbitStore } from "./sync";

function createTestTaskIngestEvents(
  count: number,
  prefix: string,
): TaskIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: `event_${prefix}_${i}` as EventID,
    type: EventType.TaskIngest,
    spec: fixtures.testTask.spec,
    entityID: `entity_${prefix}_${i}` as TaskID,
    timestampMillis: i * 5000 + 10000,
    provenance: null,
  }));
}

function createTestAttachmentIngestEvents(
  count: number,
  prefix: string,
): AttachmentIngestEvent[] {
  return Array.from(new Array(count)).map((_, i) => ({
    id: `event_${prefix}_${i}` as EventID,
    type: EventType.AttachmentIngest,
    entityID: `entity_${prefix}_${i}` as AttachmentID,
    timestampMillis: i * 5000 + 10000,
    mimeType: AttachmentMIMEType.PNG,
  }));
}

async function prepTestStore(
  prepFn: (store: OrbitStore) => Promise<Event[]>,
): Promise<{
  store: OrbitStore;
  events: Event[];
}> {
  const dbPath = path.join(os.tmpdir(), "orbit-test-" + Math.random());
  const store = await OrbitStoreFS.open(dbPath, true);
  const events = await prepFn(store);
  await store.database.putEvents(events);
  return { store, events };
}

beforeAll(() => {
  jestFetchMock.enableMocks();
});

beforeEach(() => {
  jestFetchMock.resetMocks();
});

afterAll(() => {
  jestFetchMock.dontMock();
});

test("bidi transmission", async () => {
  const { store: store1, events: events1 } = await prepTestStore(async () =>
    createTestTaskIngestEvents(2000, "store1"),
  );
  const { store: store2, events: events2 } = await prepTestStore(async () =>
    createTestTaskIngestEvents(2000, "store2"),
  );

  await syncOrbitStore(
    store1,
    new OrbitStoreSyncInterface(store2, "testServer"),
  );

  const finalEvents1 = await store1.database.listEvents({});
  const finalEvents2 = await store2.database.listEvents({});

  expect(finalEvents1).toEqual(events1.concat(events2));
  expect(finalEvents2).toEqual(events2.concat(events1));
});

test("attachments synced", async () => {
  // @ts-ignore jest-fetch-mock supports stream arguments to its mockResponse, but the argument type erroneously doesn't include it.
  jestFetchMock.mockResponse(stream.Readable.from("Test"));

  function addEvents(prefix: string) {
    return async (store: OrbitStore) => {
      const events = createTestAttachmentIngestEvents(100, prefix);
      for (const { entityID, mimeType } of events) {
        store.attachmentStore.storeAttachmentFromURL(
          "https://dummy.com",
          entityID,
          mimeType,
        );
      }
      return events;
    };
  }
  const { store: store1, events: events1 } = await prepTestStore(
    addEvents("store1"),
  );
  const { store: store2, events: events2 } = await prepTestStore(
    addEvents("store2"),
  );

  await syncOrbitStore(
    store1,
    new OrbitStoreSyncInterface(store2, "testServer"),
  );

  // All attachments on both sides should now be stored on both sides.
  for (const { entityID, mimeType } of [
    ...events1,
    ...events2,
  ] as AttachmentIngestEvent[]) {
    expect(
      await store1.attachmentStore.getURLForStoredAttachment(
        entityID,
        mimeType,
      ),
    ).not.toBeNull();
    expect(
      await store2.attachmentStore.getURLForStoredAttachment(
        entityID,
        mimeType,
      ),
    ).not.toBeNull();
  }
});
