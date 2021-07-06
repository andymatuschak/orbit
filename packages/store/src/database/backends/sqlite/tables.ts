export enum SQLTableName {
  Metadata = "metadata",
  Events = "events",
  Entities = "entities",
}

export enum SQLMetadataTableKey {
  Version = "version",
}

export enum SQLEventTableColumn {
  SequenceNumber = "sequenceNumber",
  ID = "id",
  EntityID = "entityID",
  Data = "data",
}

export enum SQLEntityTableColumn {
  ID = "id",
  EntityType = "entityType",
  LastEventID = "lastEventID",
  Data = "data",
  RowID = "rowID",
}
