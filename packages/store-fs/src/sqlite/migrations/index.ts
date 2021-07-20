import migration_20210612111147_createMetadataTable from "./20210612111147_createMetadataTable";
import migration_20210612112129_initialSchema from "./20210612112129_initialSchema";

// Should be sorted by version number.
export const migrations = [
  migration_20210612111147_createMetadataTable,
  migration_20210612112129_initialSchema,
];
export const latestSchemaVersionNumber =
  migrations[migrations.length - 1].version;
