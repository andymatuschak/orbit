import { ColorPaletteName, qaPromptType } from "metabook-core";

export interface EmbeddedPromptField {
  contents: string;
  attachmentURLs?: string[];
}

export interface EmbeddedQAPrompt {
  type: typeof qaPromptType;
  question: EmbeddedPromptField;
  answer: EmbeddedPromptField;
}

export type EmbeddedItem = EmbeddedQAPrompt;

export interface EmbeddedScreenConfiguration {
  embeddedItems: EmbeddedItem[];
  embeddedHostMetadata: EmbeddedHostMetadata;
  isDebug?: boolean;
}

export interface EmbeddedHostMetadata {
  url: string;
  title: string | null;
  siteName: string | null;
  colorPaletteName: ColorPaletteName | null;
}
