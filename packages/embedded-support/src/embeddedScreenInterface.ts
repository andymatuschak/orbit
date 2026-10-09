import type {
  AttachmentID,
  ColorPaletteName,
  TaskID,
  TaskSpec,
} from "@withorbit/core";

export interface EmbeddedTaskSeed {
  taskID: TaskID;
  spec: TaskSpec;
}

export interface EmbeddedReviewItemSeed {
  taskID: TaskID;
  componentID: string;
}

/**
 * The non-sensitive, immutable content a publisher may register with Orbit.
 * Attachment source URLs deliberately stay in the publisher page.
 */
export interface EmbeddedScreenRecord {
  tasks: EmbeddedTaskSeed[];
  reviewItems: EmbeddedReviewItemSeed[];
  attachmentIDs: AttachmentID[];
}

export interface EmbeddedScreenConfiguration extends EmbeddedScreenRecord {
  schemaVersion: 1;
  embeddedHostMetadata: EmbeddedHostMetadata;
  /** Review-session identity, not an authentication or authorization secret. */
  sessionID: string;
  /** Random capability echoed from the iframe's ready event. */
  ipcNonce: string;
  isDebug?: boolean;
}

export interface EmbeddedHostMetadata {
  url: string;
  title: string | null;
  siteName: string | null;
  colorPaletteName: ColorPaletteName | null;
}
