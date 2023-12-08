import {
  AttachmentIngestEvent,
  Event,
  EventID,
  EventType,
} from "@withorbit/core";
import { OrbitStore } from "@withorbit/store-shared";
import { OrbitStoreSyncAdapter } from "./orbitStoreSyncAdapter.js";
import { SyncAdapter } from "./syncAdapter.js";

function log(...args: any[]) {
  const [first, ...rest] = args;
  console.log(`[Sync] ${Date.now() / 1000.0} ${first}`, ...rest);
}

// We don't currently persist any metadata about whether a given event or attachment was created locally or remotely. So to avoid double-transmitting stuff, we keep track in memory of the IDs we've transmitting each way on the connection.
export interface SyncCache {
  sourceEventIDs: Set<EventID>;
  destinationEventIDs: Set<EventID>;
}

export async function syncOrbitStore({
  source,
  destination,
  sendBatchSize = 200,
  receiveBatchSize = 1000,
}: {
  source: OrbitStore;
  destination: SyncAdapter;
  sendBatchSize?: number;
  receiveBatchSize?: number;
}): Promise<{
  sentEventCount: number;
  receivedEventCount: number;
}> {
  const syncCache: SyncCache = {
    sourceEventIDs: new Set(),
    destinationEventIDs: new Set(),
  };
  const sourceSyncInterface = new OrbitStoreSyncAdapter(source, "local");

  const latestSentEventIDKey = `__sync_${destination.id}_latestEventIDSent`;
  const latestReceivedEventIDKey = `__sync_${destination.id}_latestEventIDReceived`;
  const latestEventIDs = await source.database.getMetadataValues([
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
      source.database.setMetadataValues(
        new Map([[latestSentEventIDKey, eventID]]),
      ),
    batchSize: sendBatchSize,
    syncCache,
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
      source.database.setMetadataValues(
        new Map([[latestReceivedEventIDKey, eventID]]),
      ),
    batchSize: receiveBatchSize,
    syncCache: {
      sourceEventIDs: syncCache.destinationEventIDs,
      destinationEventIDs: syncCache.sourceEventIDs,
    },
  });

  // After receiving, we send events again
  log("*** Reconciling received events");
  const { sentEventCount: sentEventCount2 } = await sendNewEvents({
    ...sendArgs,
    latestSentEventID, // use the latest sent event ID from the first step
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
  syncCache,
}: {
  source: SyncAdapter;
  destination: SyncAdapter;
  latestSentEventID: EventID | null;
  setLatestSentEventID: (id: EventID) => Promise<void>;
  batchSize: number;
  syncCache: SyncCache;
}) {
  let afterEventID = latestSentEventID;
  let sentEventCount = 0;
  while (true) {
    log("Requesting next batch of events");
    const allEvents: Event[] = await source.listEvents(afterEventID, batchSize);
    allEvents.forEach((event) => syncCache.sourceEventIDs.add(event.id));
    const newEvents = allEvents.filter(
      ({ id }) => !syncCache.destinationEventIDs.has(id),
    );
    log(`Received ${allEvents.length} events (${newEvents.length} new)`);

    if (newEvents.length > 0) {
      // Transmit any attachments ingested among these events.
      const attachmentIngestEvents = newEvents.filter(
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
      await destination.putEvents(newEvents);
      sentEventCount += newEvents.length;
      log(`Done. ${sentEventCount} total events transferred.`);
      newEvents.forEach((event) => syncCache.destinationEventIDs.add(event.id));
    }

    // Note that we examine the unfiltered set of events here, so that we don't re-request the events we've already seen in the future here.
    if (allEvents.length > 0) {
      afterEventID = allEvents[allEvents.length - 1].id;
      await setLatestSentEventID(afterEventID);
    } else {
      break;
    }
  }
  return { sentEventCount, latestSentEventID: afterEventID };
}
