import { EntityID, EntityType, EventID } from "../../../core2";

export enum DexieTable {
  Events = "events",
  Entities = "entities",
  DerivedTaskComponents = "derived_taskComponents",
}

export enum DexieEventKeys {
  SequenceNumber = "sequenceNumber",
  ID = "id",
  EntityID = "entityID",
  Data = "data",
}

export type DexieEventRow = {
  [DexieEventKeys.ID]: EventID;
  [DexieEventKeys.EntityID]: EntityID;
  [DexieEventKeys.Data]: string;
};

export type DexieEventRowWithPrimaryKey = DexieEventRow & {
  [DexieEventKeys.SequenceNumber]: number;
};

export enum DexieEntityKeys {
  RowID = "rowID",
  ID = "id",
  EntityType = "entityType",
  LastEventID = "lastEventID",
  Data = "data",
}

export type DexieEntityRow = {
  [DexieEntityKeys.ID]: EntityID;
  [DexieEntityKeys.EntityType]: EntityType;
  [DexieEntityKeys.LastEventID]: EventID;
  [DexieEntityKeys.Data]: string;
};

export type DexieEntityRowWithPrimaryKey = DexieEntityRow & {
  [DexieEntityKeys.RowID]: number;
};

export enum DexieDerivedTaskComponentKeys {
  TaskID = "taskID",
  ComponentID = "componentID",
  DueTimestampMillis = "dueTimestampMillis",
}

export type DexieDerivedTaskComponentRow = {
  [DexieDerivedTaskComponentKeys.TaskID]: string;
  [DexieDerivedTaskComponentKeys.ComponentID]: string;
  [DexieDerivedTaskComponentKeys.DueTimestampMillis]: number;
};
