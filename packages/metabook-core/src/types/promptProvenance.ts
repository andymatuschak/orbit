import { TaskProvenance } from "./taskMetadata";

export enum PromptProvenanceType {
  Anki = "anki",
  Note = "note",
}

export interface AnkiPromptProvenance extends TaskProvenance {
  provenanceType: typeof PromptProvenanceType.Anki;
  title: null;
  url: null;
}

export interface NotePromptProvenance extends TaskProvenance {
  provenanceType: typeof PromptProvenanceType.Note;
  externalID: string;
  title: string;
  modificationTimestampMillis: number;
}

export type PromptProvenance = AnkiPromptProvenance | NotePromptProvenance;
