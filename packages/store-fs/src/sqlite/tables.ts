export enum SQLTableName {
  Metadata = "metadata",
  Events = "events",
  Entities = "entities",
}

export enum SQLMetadataTableKey {
  Version = "__db_version",
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
  LastEventTimestampMillis = "lastEventTimestampMillis",
  Data = "data",
  RowID = "rowID",
}
