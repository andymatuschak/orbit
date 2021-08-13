import {
  AttachmentIngestEvent,
  Event,
  EventID,
  EventType,
} from "@withorbit/core2";
import { OrbitStore } from "@withorbit/store-shared";
import { OrbitStoreSyncAdapter } from "./orbitStoreSyncAdapter";
import { SyncAdapter } from "./syncAdapter";

function log(...args: any[]) {
  const [first, ...rest] = args;
  console.log(`[Sync] ${Date.now() / 1000.0} ${first}`, ...rest);
}

export async function syncOrbitStore(
  sourceStore: OrbitStore,
  destination: SyncAdapter,
): Promise<{ sentEventCount: number; receivedEventCount: number }> {
  const sourceSyncInterface = new OrbitStoreSyncAdapter(sourceStore, "local");

  const latestSentEventIDKey = `__sync_${destination.id}_latestEventIDSent`;
  const latestReceivedEventIDKey = `__sync_${destination.id}_latestEventIDReceived`;
  const latestEventIDs = await sourceStore.database.getMetadataValues([
    latestSentEventIDKey,
    latestReceivedEventIDKey,
  ]);

  // We use the same implementation for both sending and receiving events, switching the source/dest arguments appropriately.
  // High-level: we'll first send new events from the source to the destination, then dest->source, then source->dest again. The last step is necessary to bring the source up to the same final event ID as the destination.
  // In the future there's an opportunity here to track which events originated locally vs. remotely, so that we don't end up telling the server about events it's already told us about, but in practice it's not a big deal: it'll just ignore them. I'm not yet hugely worried about marginal efficiency for this operation, so long as improvements are at least possible in principle with this architecture.

  log("*** Sending new events");
  const sendArgs = {
    source: sourceSyncInterface,
    destination: destination,
    latestSentEventID:
      (latestEventIDs.get(latestSentEventIDKey) as EventID) ?? null,
    setLatestSentEventID: (eventID: EventID) =>
      sourceStore.database.setMetadataValues(
        new Map([[latestSentEventIDKey, eventID]]),
      ),
    batchSize: sendBatchSize,
  };
  const { sentEventCount: sentEventCount1, latestSentEventID } =
    await sendNewEvents(sendArgs);

  log("*** Receiving new events");
  const { sentEventCount: receivedEventCount } = await sendNewEvents({
    source: destination,
    destination: sourceSyncInterface,
    latestSentEventID:
      (latestEventIDs.get(latestReceivedEventIDKey) as EventID) ?? null,
    setLatestSentEventID: (eventID) =>
      sourceStore.database.setMetadataValues(
        new Map([[latestReceivedEventIDKey, eventID]]),
      ),
    batchSize: receiveBatchSize,
  });

  // After receiving, we send events again
  log("*** Reconciling received events");
  const { sentEventCount: sentEventCount2 } = await sendNewEvents({
    source: sourceSyncInterface,
    destination: destination,
    latestSentEventID, // use the latest sent event ID from the first step
    setLatestSentEventID: (eventID: EventID) =>
      sourceStore.database.setMetadataValues(
        new Map([[latestSentEventIDKey, eventID]]),
      ),
    batchSize: sendBatchSize,
  });

  return {
    sentEventCount: sentEventCount1 + sentEventCount2,
    receivedEventCount,
  };
}

async function sendNewEvents({
  source,
  destination,
  latestSentEventID,
  setLatestSentEventID,
  batchSize,
}: {
  source: SyncAdapter;
  destination: SyncAdapter;
  latestSentEventID: EventID | null;
  setLatestSentEventID: (id: EventID) => Promise<void>;
  batchSize: number;
}) {
  let afterEventID = latestSentEventID;
  let sentEventCount = 0;
  while (true) {
    log("Requesting next batch of events");
    const events: Event[] = await source.listEvents(afterEventID, batchSize);
    log(`Received ${events.length} events`);

    if (events.length > 0) {
      // Transmit any attachments ingested among these events.
      const attachmentIngestEvents = events.filter(
        (event): event is AttachmentIngestEvent =>
          event.type === EventType.AttachmentIngest,
      );
      if (attachmentIngestEvents.length > 0) {
        log(`Transferring ${attachmentIngestEvents.length} attachments`);
      }
      for (const { entityID, mimeType } of attachmentIngestEvents) {
        const contents = await source.getAttachmentContents(entityID);
        await destination.putAttachment(contents, entityID, mimeType);
      }
      if (attachmentIngestEvents.length > 0) {
        log(`Finished transferring attachments`);
      }

      log("Putting events at destination");
      await destination.putEvents(events);
      sentEventCount += events.length;
      log(`Done. ${sentEventCount} total events transferred.`);

      afterEventID = events[events.length - 1].id;
      await setLatestSentEventID(afterEventID);
    } else {
      break;
    }
  }
  return { sentEventCount, latestSentEventID: afterEventID };
}

const receiveBatchSize = 100;
const sendBatchSize = 100;
