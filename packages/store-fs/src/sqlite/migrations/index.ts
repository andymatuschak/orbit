import migration_20210612111147_createMetadataTable from "./20210612111147_createMetadataTable";
import migration_20210612112129_initialSchema from "./20210612112129_initialSchema";
import migration_20211019170802_createAttachmentsTable from "./20211019170802_createAttachmentsTable";

// Should be sorted by version number.
export const migrations = [
  migration_20210612111147_createMetadataTable,
  migration_20210612112129_initialSchema,
  migration_20211019170802_createAttachmentsTable,
];
export const latestSchemaVersionNumber =
  migrations[migrations.length - 1].version;
