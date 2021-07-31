import {
  AttachmentIngestEvent,
  Event,
  EventID,
  EventType,
} from "@withorbit/core2";
import { OrbitStore } from "@withorbit/store-shared";
import { OrbitStoreSyncInterface } from "./orbitStoreSyncInterface";
import { SyncInterface } from "./syncInterface";

export async function syncOrbitStore(
  sourceStore: OrbitStore,
  destination: SyncInterface,
): Promise<void> {
  const sourceInterface = new OrbitStoreSyncInterface(sourceStore, "local");

  // We use the same implementation for both sending and receiving events, switching the source/dest arguments appropriately.
  // In the future there's an opportunity here to track which events originated locally vs. remotely, so that we don't end up telling the server about events it's already told us about, but in practice it's not a big deal: it'll just ignore them.
  const sendPromise = sendNewEvents({
    source: sourceInterface,
    destination: destination,
    latestSentEventID: null,
    setLatestSentEventID: () => Promise.resolve(),
    batchSize: sendBatchSize,
  });
  const receivePromise = sendNewEvents({
    source: destination,
    destination: sourceInterface,
    latestSentEventID: null,
    setLatestSentEventID: () => Promise.resolve(),
    batchSize: receiveBatchSize,
  });

  await Promise.all([sendPromise, receivePromise]);
}

async function sendNewEvents({
  source,
  destination,
  latestSentEventID,
  setLatestSentEventID,
  batchSize,
}: {
  source: SyncInterface;
  destination: SyncInterface;
  latestSentEventID: EventID | null;
  setLatestSentEventID: (id: EventID) => Promise<void>;
  batchSize: number;
}) {
  let afterEventID = latestSentEventID;
  while (true) {
    const events: Event[] = await source.listEvents(afterEventID, batchSize);
    if (events.length > 0) {
      // Transmit any attachments ingested among these events.
      const attachmentIngestEvents = events.filter(
        (event): event is AttachmentIngestEvent =>
          event.type === EventType.AttachmentIngest,
      );
      for (const { entityID, mimeType } of attachmentIngestEvents) {
        const sourceURL = await source.getURLForAttachment(entityID, mimeType);
        if (!sourceURL) {
          throw new Error(`Source store has no URL for attachment ${entityID}`);
        }
        await destination.putAttachment(sourceURL, entityID, mimeType);
      }

      await destination.putEvents(events);
      afterEventID = events[events.length - 1].id;
      await setLatestSentEventID(afterEventID);
    } else {
      break;
    }
  }
}

const receiveBatchSize = 500;
const sendBatchSize = 500;
