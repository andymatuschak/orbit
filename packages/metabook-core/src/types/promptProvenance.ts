import { TaskProvenance } from "./taskMetadata";
import { ColorPaletteName } from "./colorPaletteName";

export enum PromptProvenanceType {
  Anki = "anki",
  Note = "note",
  Web = "web",
}

export interface AnkiPromptProvenance extends TaskProvenance {
  provenanceType: typeof PromptProvenanceType.Anki;
  // externalID is Anki card ID
  title: null;
  url: null;
}

export interface NotePromptProvenance extends TaskProvenance {
  // externalID is dependent on the note system
  provenanceType: typeof PromptProvenanceType.Note;
  title: string;
  modificationTimestampMillis: number;
}

export interface WebPromptProvenance extends TaskProvenance {
  // externalID is URL
  provenanceType: typeof PromptProvenanceType.Web;
  modificationTimestampMillis: null;
  siteName: string | null;
  colorPaletteName: ColorPaletteName | null;
}

export type PromptProvenance = AnkiPromptProvenance | NotePromptProvenance;
