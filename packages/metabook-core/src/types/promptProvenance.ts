export enum PromptProvenanceType {
  Anki = "anki",
  Note = "note",
}

export type AnkiPromptProvenance = {
  provenanceType: typeof PromptProvenanceType.Anki;
  cardID: number;
  cardModificationTimestampMillis: number;
};

export type NotePromptProvenance = {
  provenanceType: typeof PromptProvenanceType.Note;
  noteID: string;
  noteTitle: string;
  noteURL: string | null;
  noteModificationTimestampMillis: number;
};

export type PromptProvenance = AnkiPromptProvenance | NotePromptProvenance;
