import { ColorPaletteName, ReviewItem } from "@withorbit/core";

export interface EmbeddedScreenConfiguration {
  reviewItems: ReviewItem[];
  // Less than ideal: here AttachmentIDs are keys of a plain old object, but we can't express that in the type (TypeScript will only allow strings and numbers to be keys of indexed types). Normally we'd deal with this by using a Map, but this structure needs to be serialized to/from JSON.
  attachmentIDsToURLs: { [AttachmentID: string]: string };
  embeddedHostMetadata: EmbeddedHostMetadata;
  sessionStartTimestampMillis: number;
  isDebug?: boolean;
}

export interface EmbeddedHostMetadata {
  url: string;
  title: string | null;
  siteName: string | null;
  colorPaletteName: ColorPaletteName | null;
}
