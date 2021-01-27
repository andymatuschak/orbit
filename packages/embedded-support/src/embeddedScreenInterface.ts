import { clozePromptType, ColorPaletteName, qaPromptType } from "metabook-core";

export interface EmbeddedPromptField {
  contents: string;
  attachmentURLs?: string[];
}

export interface EmbeddedQAPrompt {
  type: typeof qaPromptType;
  question: EmbeddedPromptField;
  answer: EmbeddedPromptField;
}

export interface EmbeddedClozePrompt {
  type: typeof clozePromptType;
  body: EmbeddedPromptField;
}

export type EmbeddedItem = EmbeddedQAPrompt | EmbeddedClozePrompt;

export interface EmbeddedScreenConfiguration {
  embeddedItems: EmbeddedItem[];
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
