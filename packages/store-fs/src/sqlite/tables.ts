export enum SQLTableName {
  Metadata = "metadata",
  Events = "events",
  Entities = "entities",
  Attachments = "attachments",
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

export enum SQLAttachmentTableColumn {
  ID = "id",
  Data = "data",
  MimeType = "mimeType",
}
