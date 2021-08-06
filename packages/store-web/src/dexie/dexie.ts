import Dexie from "dexie";
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
} from "./tables";

export class DexieDatabase extends Dexie {
  [DexieTable.Events]: Dexie.Table<DexieEventRow, number>;
  [DexieTable.Entities]: Dexie.Table<DexieEntityRow, number>;
  [DexieTable.DerivedTaskComponents]: Dexie.Table<
    DexieDerivedTaskComponentRow,
    string
  >;
  [DexieTable.Metadata]: Dexie.Table<DexieMetadataRow, string>;

  constructor(name: string, indexedDB: IDBFactory) {
    super(name, { indexedDB });

    this.version(1).stores({
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
    });

    this.events = this.table(DexieTable.Events);
    this.entities = this.table(DexieTable.Entities);
    this.derived_taskComponents = this.table(DexieTable.DerivedTaskComponents);
    this.metadata = this.table(DexieTable.Metadata);
  }
}
