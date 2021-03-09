import { Prompt } from "incremental-thinking";
import { JsonMap } from "../../util/JSONTypes";
import { Opaque } from "../../util/opaque";
import { PromptTaskNoteData } from "../notePrompts";
import { TaskIDPath } from "../taskCache";

export const ankiNoteTag = "spaced-everything"; // Tag applied to notes created in Anki

export const clozeModelName = "Cloze-spaced-everything"; // Anki model name for cloze-type prompts.
export type AnkiNoteClozeFields = {
  Text: string;
  NoteTitle: string;
  NoteURL: string;
  _Path: AnkiPathField;
  _OriginalMarkdown: string;
  _NoteDataJSON: string;
};

export const qaPromptModelName = "QA-spaced-everything"; // Anki model name for cloze-type prompts.
export type AnkiNoteQAPromptFields = {
  Front: string;
  Back: string;
  NoteTitle: string;
  NoteURL: string;
  _Path: AnkiPathField;
  _NoteDataJSON: string;
  _PromptJSON: string;
};

// TODO separate and encapsulate "wire" / "storage" models; layer appropriately

interface AnkiNoteBase extends JsonMap {
  noteId: AnkiNoteID;
  tags: string[];
}

export interface AnkiClozeNote extends AnkiNoteBase {
  modelName: typeof clozeModelName;
  fields: AnkiNoteClozeFields;
}

export interface AnkiQAPromptNote extends AnkiNoteBase {
  modelName: typeof qaPromptModelName;
  fields: AnkiNoteQAPromptFields;
}

export type AnkiNote = AnkiClozeNote | AnkiQAPromptNote;
export type AnkiNoteFields = AnkiNoteClozeFields | AnkiNoteQAPromptFields;

export type AnkiNoteID = Opaque<number>;
export type AnkiPathField = Opaque<string>;

export function isAnkiClozeNote(note: AnkiNote): note is AnkiClozeNote {
  return note.modelName === clozeModelName;
}

export function isAnkiQAPromptNote(note: AnkiNote): note is AnkiQAPromptNote {
  return note.modelName === qaPromptModelName;
}

export interface AnkiPrompt {
  prompt: Prompt;
  path: TaskIDPath;
  noteData: PromptTaskNoteData;
}
