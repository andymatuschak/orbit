export const qaPromptModelName = "QA-spaced-everything"; // Anki model name for cloze-type prompts.
export const clozeModelName = "Cloze-spaced-everything"; // Anki model name for cloze-type prompts.

export interface NoteDataField {
  modificationTimestamp: number;
  noteTitle: string | null;
  externalNoteID: NoteID | null;
}

export interface NoteID {
  type: string;
  id: string;
  openURL: string | null;
}
