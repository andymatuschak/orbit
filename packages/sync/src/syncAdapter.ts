import {
  AttachmentID,
  AttachmentMIMEType,
  Event,
  EventID,
} from "@withorbit/core";

export interface SyncAdapter {
  // This ID is used to track state associated with the remote destination associated with this interface (e.g. the last event ID sent/received to/from this destination).
  // Different destinations (e.g. test servers, production server, local host) should have different IDs.
  id: string;

  listEvents(afterEventID: EventID | null, limit: number): Promise<Event[]>;

  putEvents(events: Event[]): Promise<void>;

  putAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void>;

  getAttachmentContents(id: AttachmentID): Promise<Uint8Array>;
}
