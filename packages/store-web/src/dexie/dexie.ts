import { EntityType, Task } from "@withorbit/core";
import * as Dexie from "dexie";
import { Dexie as DexieDB } from "dexie";
import {
  DexieDerivedTaskComponentKeys,
  DexieDerivedTaskComponentRow,
  DexieEntityKeys,
  DexieEntityRow,
  DexieEventKeys,
  DexieEventRow,
  DexieMetadataKeys,
  DexieMetadataRow,
  DexieTable,
} from "./tables.js";

export class DexieDatabase extends DexieDB {
  [DexieTable.Events]: Dexie.Table<DexieEventRow, number>;
  [DexieTable.Entities]: Dexie.Table<DexieEntityRow, number>;
  [DexieTable.DerivedTaskComponents]: Dexie.Table<
    DexieDerivedTaskComponentRow,
    string
  >;
  [DexieTable.Metadata]: Dexie.Table<DexieMetadataRow, string>;

  constructor(name: string, indexedDB: IDBFactory) {
    super(name, { indexedDB });

    this.version(2)
      .stores({
        [DexieTable.Events]: [
          `++${DexieEventKeys.SequenceNumber}`,
          `&${DexieEventKeys.ID}`,
          DexieEventKeys.EntityID,
          `[${DexieEventKeys.EntityID}+${DexieEventKeys.SequenceNumber}]`,
        ].join(", "),

        [DexieTable.Entities]: [
          `++${DexieEntityKeys.RowID}`,
          `&${DexieEntityKeys.ID}`,
          `[${DexieEntityKeys.EntityType}+${DexieEntityKeys.RowID}]`,
        ].join(", "),

        [DexieTable.DerivedTaskComponents]: [
          `&[${DexieDerivedTaskComponentKeys.TaskID}+${DexieDerivedTaskComponentKeys.ComponentID}]`,
          DexieDerivedTaskComponentKeys.TaskID,
          DexieDerivedTaskComponentKeys.DueTimestampMillis,
        ].join(", "),

        [DexieTable.Metadata]: `&${DexieMetadataKeys.Key}`,
      })
      .upgrade((tx) => {
        tx.table<DexieEntityRow>(DexieTable.Entities)
          .where(DexieEntityKeys.EntityType)
          .equals(EntityType.Task)
          .filter((row) => {
            return (JSON.parse(row.data) as Task).isDeleted;
          })
          .toArray((deletedRows) => {
            tx.table(DexieTable.DerivedTaskComponents)
              .where(DexieDerivedTaskComponentKeys.TaskID)
              .anyOf(deletedRows.map(({ id }) => id))
              .delete();
          });
      });

    this.events = this.table(DexieTable.Events);
    this.entities = this.table(DexieTable.Entities);
    this.derived_taskComponents = this.table(DexieTable.DerivedTaskComponents);
    this.metadata = this.table(DexieTable.Metadata);
  }
}
