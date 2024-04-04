import { EntityType } from "@withorbit/core";
import { SQLMigration } from "./migrationType.js";

const migration: SQLMigration = {
  version: 20230726103155,
  statements: [
    `DELETE FROM derived_taskComponents WHERE taskID IN (SELECT id AS taskID FROM entities WHERE json_extract(data, '$.isDeleted') = TRUE)`,
    `DROP TRIGGER entities_taskComponents_insert`,
    `DROP TRIGGER entities_taskComponents_update`,
    `
    CREATE TRIGGER entities_taskComponents_insert AFTER INSERT ON entities BEGIN
      INSERT INTO derived_taskComponents (taskID, componentID, dueTimestampMillis)
      SELECT new.id, key, json_extract(value, '$.dueTimestampMillis') FROM json_each(json_extract(new.data, '$.componentStates'))
        WHERE new.entityType = '${EntityType.Task}'
        AND json_extract(new.data, '$.isDeleted') IS NOT TRUE;
    END
    `,
    `
    CREATE TRIGGER entities_taskComponents_update AFTER UPDATE ON entities BEGIN
      DELETE FROM derived_taskComponents WHERE taskID = old.id AND old.entityType = '${EntityType.Task}';
      INSERT INTO derived_taskComponents (taskID, componentID, dueTimestampMillis)
      SELECT new.id, key, json_extract(value, '$.dueTimestampMillis') FROM json_each(json_extract(new.data, '$.componentStates'))
        WHERE new.entityType = '${EntityType.Task}'
        AND json_extract(new.data, '$.isDeleted') IS NOT TRUE;
    END
    `,
  ],
};
export default migration;
