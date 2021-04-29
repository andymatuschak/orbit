import * as axios from "axios";
import { processor, clozePromptType, qaPromptType } from "incremental-thinking";
import { AnyJson } from "../../../../util/JSONTypes";
import unreachableCaseError from "../../../../util/unreachableCaseError";
import {
  decodeTaskIDPath,
  encodeTaskIDPath,
  TaskIDPath,
} from "../../../taskCache";
import {
  AnkiNote,
  AnkiNoteFields,
  AnkiNoteID,
  ankiNoteTag,
  AnkiPrompt,
  clozeModelName,
  isAnkiClozeNote,
  isAnkiQAPromptNote,
  qaPromptModelName,
} from "../../dataModel";
import {
  createAnkiTextFromClozePrompt,
  createClozePromptFromAnkiOriginalMarkdownField,
  decodeAnkiPathFieldToTaskIDPath,
  encodeTaskIDPathToAnkiPathField,
} from "./ankiTextEncoding";

export type RequestSpec<ResponseData extends AnyJson> = {
  config: axios.AxiosRequestConfig;
};

function createRequest<
  ServerResponseData = any,
  TransformedResponseData extends AnyJson = AnyJson
>(
  actionName: string,
  parameters?: AnyJson,
  responseTransformer?: (data: ServerResponseData) => TransformedResponseData,
): RequestSpec<TransformedResponseData> {
  return {
    config: {
      method: "post",
      url: "/",
      data: {
        action: actionName,
        version: 6,
        params: parameters,
      },
      transformResponse: responseTransformer
        ? [
            (json) => {
              const { result, error } = JSON.parse(json);
              return {
                result: responseTransformer(result),
                error,
              };
            },
          ]
        : undefined,
    },
  };
}

const untitledNoteSentinel = "[untitled note]";

function getAnkiFieldsForAnkiPrompt(ankiPrompt: AnkiPrompt): AnkiNoteFields {
  const prompt = ankiPrompt.prompt;
  const noteTitle = ankiPrompt.noteData.noteTitle ?? untitledNoteSentinel;
  const noteURL = ankiPrompt.noteData.externalNoteID?.openURL?.toString() ?? "";
  if (prompt.type === clozePromptType) {
    return {
      Text: createAnkiTextFromClozePrompt(prompt),
      NoteTitle: noteTitle,
      NoteURL: noteURL,
      _Path: encodeTaskIDPathToAnkiPathField(ankiPrompt.path),
      _OriginalMarkdown: processor.stringify(prompt.block),
      _NoteDataJSON: JSON.stringify(ankiPrompt.noteData),
    };
  } else if (prompt.type === qaPromptType) {
    return {
      Front: processor.stringify(prompt.question),
      Back: processor.stringify(prompt.answer),
      NoteTitle: noteTitle,
      NoteURL: ankiPrompt.noteData.externalNoteID?.openURL?.toString() ?? "",
      _Path: encodeTaskIDPathToAnkiPathField(ankiPrompt.path),
      _NoteDataJSON: JSON.stringify(ankiPrompt.noteData),
      _PromptJSON: JSON.stringify(ankiPrompt.prompt),
    };
  } else {
    throw unreachableCaseError(prompt);
  }
}

export function getAnkiPromptForAnkiNote(ankiNote: AnkiNote): AnkiPrompt {
  if (isAnkiClozeNote(ankiNote)) {
    return {
      prompt: createClozePromptFromAnkiOriginalMarkdownField(
        ankiNote.fields._OriginalMarkdown,
      ),
      path: decodeAnkiPathFieldToTaskIDPath(ankiNote.fields._Path),
      noteData: JSON.parse(ankiNote.fields._NoteDataJSON),
    };
  } else if (isAnkiQAPromptNote(ankiNote)) {
    return {
      prompt: JSON.parse(ankiNote.fields._PromptJSON),
      noteData: JSON.parse(ankiNote.fields._NoteDataJSON),
      path: decodeAnkiPathFieldToTaskIDPath(ankiNote.fields._Path),
    };
  } else {
    throw unreachableCaseError(ankiNote);
  }
}

export function addNotes(
  ankiPrompts: AnkiPrompt[],
  deckName: string,
): RequestSpec<AnkiNoteID[]> {
  return createRequest("addNotes", {
    notes: ankiPrompts.map((ankiPrompt) => {
      let modelName: string;
      const { prompt } = ankiPrompt;
      if (prompt.type === clozePromptType) {
        modelName = clozeModelName;
      } else if (prompt.type === qaPromptType) {
        modelName = qaPromptModelName;
      } else {
        throw unreachableCaseError(prompt);
      }
      return {
        deckName,
        modelName,
        fields: getAnkiFieldsForAnkiPrompt(ankiPrompt),
        tags: [ankiNoteTag],
      };
    }),
  });
}

export function getAnkiNoteIDsForSubtree(
  path: TaskIDPath,
): RequestSpec<AnkiNoteID[]> {
  return createRequest("findNotes", {
    // I don't know why the * is necessary. Anki doesn't find the result otherwise.
    query: `_Path:${encodeTaskIDPathToAnkiPathField(path)}*`,
  });
}

export function deleteAnkiNoteIDs(
  ankiNoteIDs: AnkiNoteID[],
): RequestSpec<null> {
  return createRequest("deleteNotes", { notes: ankiNoteIDs });
}

export function findAllPromptAnkiNoteIDs(): RequestSpec<AnkiNoteID[]> {
  return createRequest("findNotes", { query: `tag:${ankiNoteTag}` });
}

export function getAnkiNotes(
  ankiNoteIDs: AnkiNoteID[],
): RequestSpec<AnkiNote[]> {
  return createRequest("notesInfo", { notes: ankiNoteIDs }, (notes) =>
    notes.map((note: any) => {
      const fields: { [key: string]: string } = {};
      for (const field of Object.keys(note.fields)) {
        fields[field] = note.fields[field].value;
      }
      return {
        ...note,
        fields,
      };
    }),
  );
}

export function updateAnkiNote(ankiNoteID: AnkiNoteID, ankiPrompt: AnkiPrompt) {
  return createRequest("updateNoteFields", {
    note: {
      id: ankiNoteID,
      fields: getAnkiFieldsForAnkiPrompt(ankiPrompt),
    },
  });
}

export function sync() {
  return createRequest("sync");
}

export function getModelNames(): RequestSpec<string[]> {
  return createRequest("modelNames");
}

export function createModel(
  modelName: string,
  fields: string[],
  css: string,
  cardTemplates: { Front: string; Back: string },
) {
  return createRequest("createModel", {
    modelName,
    inOrderFields: fields,
    css,
    cardTemplates,
  });
}
