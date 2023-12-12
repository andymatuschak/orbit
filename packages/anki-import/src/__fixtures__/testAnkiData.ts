import {
  Card,
  CardTemplate,
  Collection,
  LearnEaseRating,
  Log,
  Model,
  ModelField,
  ModelType,
  Note,
  ReviewLogType,
} from "../ankiPkg/index.js";

export const testBasicModel: Model = {
  id: "101",
  type: ModelType.Standard,
  flds: [{ name: "Front" } as ModelField, { name: "Back" } as ModelField],
  tmpls: [{} as CardTemplate],
} as Partial<Model> as Model;

export const testCollection: Collection = {
  models: { [testBasicModel.id]: testBasicModel },
} as Partial<Collection> as Collection;

export const testNote: Note = {
  id: 100,
  mid: Number.parseInt(testBasicModel.id),
  flds: `Test Q\x1fTest A`,
} as Partial<Note> as Note;

export const testCard: Card = {
  id: 500,
  mod: 700,
  nid: testNote.id,
} as Partial<Card> as Card;

export const testLog: Log = {
  id: 550,
  type: ReviewLogType.Learn,
  ease: LearnEaseRating.Easy,
} as Partial<Log> as Log;
