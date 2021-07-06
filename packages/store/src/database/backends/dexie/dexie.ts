import Dexie, { Transaction } from "dexie";
import { Entity } from "../../../core2";
import {
  DexieDerivedTaskComponentColumn,
  DexieDerivedTaskComponentRow,
  DexieEntityColumn,
  DexieEntityRow,
  DexieEventColumn,
  DexieEventRow,
  DexieTable,
} from "./tables";

export class DexieDatabase extends Dexie {
  [DexieTable.Events]: Dexie.Table<DexieEventRow, number>;
  [DexieTable.Entities]: Dexie.Table<DexieEntityRow, number>;
  [DexieTable.DerivedTaskComponents]: Dexie.Table<
    DexieDerivedTaskComponentRow,
    string
  >;

  constructor(name: string, indexedDB: IDBFactory) {
    super(name, { indexedDB });

    this.version(1).stores({
      [DexieTable.Events]: [
        `++${DexieEventColumn.SequenceNumber}`,
        `&${DexieEventColumn.ID}`,
        DexieEventColumn.EntityID,
        DexieEventColumn.Data,
        `[${DexieEventColumn.EntityID}+${DexieEventColumn.SequenceNumber}]`,
      ].join(", "),

      [DexieTable.Entities]: [
        `++${DexieEntityColumn.RowID}`,
        `&${DexieEntityColumn.ID}`,
        DexieEntityColumn.lastEventID,
        DexieEntityColumn.Data,
      ].join(", "),

      [DexieTable.DerivedTaskComponents]: [
        `&[${DexieDerivedTaskComponentColumn.TaskID}+${DexieDerivedTaskComponentColumn.ComponentID}]`,
        DexieDerivedTaskComponentColumn.ComponentID,
        DexieDerivedTaskComponentColumn.TaskID,
        DexieDerivedTaskComponentColumn.DueTimestampMillis,
      ].join(", "),
    });

    this.events = this.table(DexieTable.Events);
    this.entities = this.table(DexieTable.Entities);
    this.derived_taskComponents = this.table(DexieTable.DerivedTaskComponents);

    this.entities.hook("creating", this.onEntitiesInsert);
    this.entities.hook("updating", this.onEntitiesUpdate);
    this.entities.hook("deleting", this.onEntitiesDelete);
  }

  onEntitiesInsert(
    primaryKey: number,
    obj: DexieEntityRow,
    transaction: Transaction,
  ) {
    insertDerivedTaskComponent(obj, transaction);
  }

  async onEntitiesUpdate(
    // `Object` type is needed to conform to Dexie types
    // eslint-disable-next-line @typescript-eslint/ban-types
    modifications: Object,
    primaryKey: number,
    obj: DexieEntityRow,
    transaction: Transaction,
  ) {
    await transaction.db
      .table(DexieTable.DerivedTaskComponents)
      .where(DexieDerivedTaskComponentColumn.TaskID)
      .equals(obj.id)
      .delete();

    insertDerivedTaskComponent({ ...obj, ...modifications }, transaction);
  }

  onEntitiesDelete(
    primaryKey: number,
    obj: DexieEntityRow,
    transaction: Transaction,
  ) {
    transaction.db
      .table(DexieTable.DerivedTaskComponents)
      .where(DexieDerivedTaskComponentColumn.TaskID)
      .equals(primaryKey)
      .delete();
  }
}

function insertDerivedTaskComponent(
  obj: DexieEntityRow,
  transaction: Transaction,
) {
  const data: Entity = JSON.parse(obj.data);
  if (!data || !data.componentStates) return;

  const newComponents = Object.entries(data.componentStates).map(
    ([componentID, value]) => ({
      taskID: data.id,
      componentID,
      dueTimestampMillis: value.dueTimestampMillis,
    }),
  );
  transaction.db.table(DexieTable.DerivedTaskComponents).bulkPut(newComponents);
}
