import type { EmbeddedReviewSubmission } from "@withorbit/api";
import type { AttachmentID, AttachmentMIMEType } from "@withorbit/core";
import type {
  EmbeddedScreenConfiguration,
  EmbeddedScreenRecord,
} from "./embeddedScreenInterface.js";

// Ready/configuration, page ordering and attachment handoff retain their wire
// shape. PageReview is additive; the iframe no longer asks the publisher for a
// worker or a vault port.
export const embeddedProtocolVersion = 1 as const;

interface EmbeddedProtocolMessage {
  protocolVersion: typeof embeddedProtocolVersion;
  ipcNonce: string;
}

export enum EmbeddedHostEventType {
  InitialConfiguration = "initialConfiguration",
  HostUpdate = "hostUpdate",
  AttachmentResponse = "attachmentResponse",
  PageReview = "pageReview",
}

export interface EmbeddedHostInitialConfigurationEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedHostEventType.InitialConfiguration;
  configuration: EmbeddedScreenConfiguration;
}

export interface EmbeddedHostUpdateEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedHostEventType.HostUpdate;
  state: EmbeddedHostState;
}

export interface EmbeddedHostState {
  orderedScreenRecords: (EmbeddedScreenRecord | null)[];
  receiverIndex: number;
}

/** Only anonymous, public article progress crosses the publisher boundary. */
export interface EmbeddedHostPageReviewEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedHostEventType.PageReview;
  review: EmbeddedReviewSubmission;
}

export type EmbeddedAttachmentResponseResult =
  | {
      status: "ok";
      bytes: ArrayBuffer;
      mediaTypeHint: AttachmentMIMEType | null;
    }
  | {
      status: "error";
      code:
        | "not-allowlisted"
        | "invalid-url"
        | "network"
        | "http"
        | "too-large"
        | "timeout";
      message: string;
    };

export interface EmbeddedHostAttachmentResponseEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedHostEventType.AttachmentResponse;
  requestID: string;
  attachmentID: AttachmentID;
  result: EmbeddedAttachmentResponseResult;
}

export enum EmbeddedScreenEventType {
  Ready = "ready",
  AttachmentRequest = "attachmentRequest",
  PageReview = "pageReview",
}

export interface EmbeddedScreenReadyEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedScreenEventType.Ready;
}

export interface EmbeddedScreenAttachmentRequestEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedScreenEventType.AttachmentRequest;
  requestID: string;
  attachmentID: AttachmentID;
}

export interface EmbeddedScreenPageReviewEvent extends EmbeddedProtocolMessage {
  type: typeof EmbeddedScreenEventType.PageReview;
  review: EmbeddedReviewSubmission;
}
