import { EventID, TaskID } from "../../../core2";

export enum DexieTable {
  Events = "events",
  Entities = "entities",
  DerivedTaskComponents = "derived_taskComponents",
}

export enum DexieEventColumn {
  SequenceNumber = "sequenceNumber",
  ID = "id",
  EntityID = "entityID",
  Data = "data",
}

export type DexieEventRow = {
  [DexieEventColumn.ID]: EventID;
  [DexieEventColumn.EntityID]: TaskID;
  [DexieEventColumn.Data]: string;
};

export enum DexieEntityColumn {
  RowID = "rowID",
  ID = "id",
  lastEventID = "lastEventID",
  Data = "data",
}

export type DexieEntityRow = {
  [DexieEntityColumn.ID]: TaskID;
  [DexieEntityColumn.lastEventID]: EventID;
  [DexieEntityColumn.Data]: string;
};

export type DexieEntityRowWithPrimaryKey = DexieEntityRow & {
  [DexieEntityColumn.RowID]: number;
};

export enum DexieDerivedTaskComponentColumn {
  TaskID = "taskID",
  ComponentID = "componentID",
  DueTimestampMillis = "dueTimestampMillis",
}

export type DexieDerivedTaskComponentRow = {
  [DexieDerivedTaskComponentColumn.TaskID]: string;
  [DexieDerivedTaskComponentColumn.ComponentID]: string;
  [DexieDerivedTaskComponentColumn.DueTimestampMillis]: number;
};
