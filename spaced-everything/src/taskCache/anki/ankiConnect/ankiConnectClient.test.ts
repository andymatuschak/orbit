import { AnyJson } from "../../../util/JSONTypes";
import { EncodedTaskIDPath } from "../../taskCache";
import {
  AnkiClozeNote,
  AnkiNoteID,
  ankiNoteTag,
  clozeModelName
} from "../dataModel";
import {
  AnkiConnectClient,
  createAnkiConnectClient
} from "./ankiConnectClient";
import {
  findAllPromptAnkiNoteIDs,
  getAnkiNotes,
  RequestSpec
} from "./util/requestFactory";
import MockAdapter from "axios-mock-adapter";
import axios from "axios";

test("typechecking", async () => {
  const client: AnkiConnectClient = {
    request<ResponseData extends AnyJson>(
      request: RequestSpec<ResponseData>
    ): Promise<ResponseData> {
      return Promise.resolve([123] as ResponseData);
    },

    deckName: "Default"
  };

  const ankiNoteIDs = await client.request(findAllPromptAnkiNoteIDs());
  expect(ankiNoteIDs).toEqual([123]);
});

describe("mock client", () => {
  const instance = axios.create();
  const mock = new MockAdapter(instance);
  const client = createAnkiConnectClient(instance, "Default");

  test("findNotes", async () => {
    const ankiNote = {
      noteId: 123,
      modelName: clozeModelName,
      tags: [ankiNoteTag],
      fields: {
        Text: { value: "Test {{c1::hi}}", order: 1 },
        _OriginalMarkdown: { value: "Test {hi}", order: 2 },
        _Path: { value: "123/456" as EncodedTaskIDPath, order: 3 }
      }
    };
    mock
      .onPost("/", {
        action: "notesInfo",
        version: 6,
        params: {
          notes: [123]
        }
      })
      .reply(200, JSON.stringify({ result: [ankiNote], error: null }));

    expect(await client.request(getAnkiNotes([123 as AnkiNoteID]))).toEqual([
      {
        noteId: 123,
        modelName: clozeModelName,
        tags: [ankiNoteTag],
        fields: {
          Text: "Test {{c1::hi}}",
          _OriginalMarkdown: "Test {hi}",
          _Path: "123/456"
        }
      }
    ]);
  });
});
