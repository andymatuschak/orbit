import Dexie, { Transaction } from "dexie";
import { Entity, EntityType, TaskID } from "../../../core2";
import {
  DexieDerivedTaskComponentKeys,
  DexieDerivedTaskComponentRow,
  DexieEntityKeys,
  DexieEntityRow,
  DexieEventKeys,
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
    });

    this.events = this.table(DexieTable.Events);
    this.entities = this.table(DexieTable.Entities);
    this.derived_taskComponents = this.table(DexieTable.DerivedTaskComponents);

    this.entities.hook("creating", onEntitiesInsert);
    this.entities.hook("updating", onEntitiesUpdate);
    this.entities.hook("deleting", onEntitiesDelete);
  }
}

function onEntitiesInsert(
  primaryKey: number,
  obj: DexieEntityRow,
  transaction: Transaction,
) {
  insertDerivedTaskComponent(obj, transaction);
}

async function onEntitiesUpdate(
  // `Object` type is needed to conform to Dexie types
  // eslint-disable-next-line @typescript-eslint/ban-types
  modifications: Object,
  primaryKey: number,
  obj: DexieEntityRow,
  transaction: Transaction,
) {
  if (obj.entityType === EntityType.Task) {
    await deleteAllDerivedTaskComponentsByTaskID(obj.id as TaskID, transaction);

    insertDerivedTaskComponent({ ...obj, ...modifications }, transaction);
  }
}

async function onEntitiesDelete(
  primaryKey: number,
  obj: DexieEntityRow,
  transaction: Transaction,
) {
  if (obj.entityType === EntityType.Task) {
    await deleteAllDerivedTaskComponentsByTaskID(obj.id as TaskID, transaction);
  }
}

async function deleteAllDerivedTaskComponentsByTaskID(
  taskID: TaskID,
  transaction: Transaction,
) {
  await transaction.db
    .table(DexieTable.DerivedTaskComponents)
    .where(DexieDerivedTaskComponentKeys.TaskID)
    .equals(taskID)
    .delete();
}

function insertDerivedTaskComponent(
  obj: DexieEntityRow,
  transaction: Transaction,
) {
  const data: Entity = JSON.parse(obj.data);
  // this should never occur in practice. Only needed to match the behaviour of SQLite
  // in database.test.ts
  if (!data || data.type != EntityType.Task || !data.componentStates) return;

  const newComponents = Object.entries(data.componentStates).map(
    ([componentID, value]) => ({
      taskID: data.id,
      componentID,
      dueTimestampMillis: value.dueTimestampMillis,
    }),
  );
  transaction.db.table(DexieTable.DerivedTaskComponents).bulkPut(newComponents);
}
