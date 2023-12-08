import migration_20210612111147_createMetadataTable from "./20210612111147_createMetadataTable.js";
import migration_20210612112129_initialSchema from "./20210612112129_initialSchema.js";
import migration_20211019170802_createAttachmentsTable from "./20211019170802_createAttachmentsTable.js";
import migration_20230726103155_derived_taskComponents_whenNotDeleted from "./20230726103155_derived_taskComponents_whenNotDeleted.js";

// Should be sorted by version number.
export const migrations = [
  migration_20210612111147_createMetadataTable,
  migration_20210612112129_initialSchema,
  migration_20211019170802_createAttachmentsTable,
  migration_20230726103155_derived_taskComponents_whenNotDeleted,
];
export const latestSchemaVersionNumber =
  migrations[migrations.length - 1].version;
