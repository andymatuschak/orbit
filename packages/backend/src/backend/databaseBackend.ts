import {
  AttachmentReference,
  Entity,
  EntityID,
  EntityType,
  Event,
  EventID,
  IDOfEntity,
  Task,
} from "@withorbit/core2";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
  DatabaseEntityQuery,
  DatabaseEventQuery,
  DatabaseQueryPredicate,
} from "@withorbit/store-shared";
import { firestore } from "firebase-admin";
import { getDatabase } from "./firebase";
import { getFirebaseKeyFromStringHash } from "./firebaseSupport/firebaseKeyEncoding";

export class FirestoreDatabaseBackend implements DatabaseBackend {
  private _userID: string;
  private _database: firestore.Firestore;

  constructor(userID: string, database: firestore.Firestore = getDatabase()) {
    this._userID = userID;
    this._database = database;
  }

  async close(): Promise<void> {
    await this._database.terminate();
  }

  async getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    const docs = await this._getByID(
      this._getEntityCollectionRef<EntityDocument>(),
      entityIDs,
      (ids) => this._database.getAll(...ids),
    );
    return getEntityRecordMapFromFirestoreDocs(docs);
  }

  async getEvents<E extends Event, ID extends EventID>(
    eventIDs: ID[],
  ): Promise<Map<ID, E>> {
    const docs = await this._getByID(
      this._getEventCollectionRef<E>(),
      eventIDs,
      (ids) => this._database.getAll(...ids),
    );
    const output = new Map<ID, E>();
    for (const doc of docs) {
      if (doc) {
        output.set(doc.event.id as ID, doc.event);
      }
    }
    return output;
  }

  async listEntities<E extends Entity>(
    query: DatabaseEntityQuery<E>,
  ): Promise<DatabaseBackendEntityRecord<E>[]> {
    // Using the template string type here just to enforce that the key path I'm using here is indeed a valid key path into the Entity type. Though I can't enforce that the value at that key is actually an EntityType.
    const entityTypeKeyPath: `${EntityDocumentKeys.Entity}.${keyof Entity}` =
      `${EntityDocumentKeys.Entity}.type` as const;

    let firestoreQuery = this._getEntityCollectionRef()
      .orderBy(EntityDocumentKeys.CreatedAtServerTimestamp)
      .where(entityTypeKeyPath, "==", query.entityType);
    if (query.limit !== undefined) {
      firestoreQuery = firestoreQuery.limit(query.limit);
    }

    let docs: firestore.DocumentSnapshot<EntityDocument>[];
    if (query.afterID) {
      const afterEntitySnapshot = await this._getEntityRef(query.afterID).get();
      firestoreQuery = firestoreQuery.startAfter(afterEntitySnapshot);

      const { predicate } = query;
      // We can't use native queries for both the predicate and the afterID. So if there's both, we'll have to filter after the fact, alas.
      if (predicate) {
        docs = await fetchDocumentsWithPostQueryFilter(
          firestoreQuery,
          (doc) => evaluateQueryPredicate(doc.entity, predicate),
          query.limit ?? null,
        );
      } else {
        docs = (await firestoreQuery.get()).docs;
      }
    } else {
      if (query.predicate) {
        const documentKey: TaskDocumentKey = {
          dueTimestampMillis: TaskDocumentKey.MinimumDueTimestampMillis,
        }[query.predicate[0]];
        firestoreQuery = firestoreQuery.where(
          documentKey,
          mapQueryPredicateToFirestoreOp(query.predicate),
          query.predicate[2],
        );
      }
      docs = (await firestoreQuery.get()).docs;
    }

    return docs.map((doc) => getEntityRecordFromFirestoreDoc(doc.data()!));
  }

  async listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    let firestoreQuery = this._getEventCollectionRef().orderBy(
      EventDocumentKeys.ServerTimestamp,
    );
    if (query.limit !== undefined) {
      firestoreQuery = firestoreQuery.limit(query.limit);
    }

    let docs: firestore.DocumentSnapshot<EventDocument>[];
    if (query.afterID) {
      const afterEventSnapshot = await this._getEventRef(query.afterID).get();
      firestoreQuery = firestoreQuery.startAfter(afterEventSnapshot);

      const { predicate } = query;
      // We can't use native queries for both the predicate and the afterID. So if there's both, we'll have to filter after the fact, alas.
      if (predicate) {
        docs = await fetchDocumentsWithPostQueryFilter(
          firestoreQuery,
          (doc) => evaluateQueryPredicate(doc.event, predicate),
          query.limit ?? null,
        );
      } else {
        docs = (await firestoreQuery.get()).docs;
      }
    } else {
      if (query.predicate) {
        const keyPathMapping: {
          [K in typeof query.predicate[0]]: `${EventDocumentKeys.Event}.${keyof Event}`;
        } = {
          entityID: `${EventDocumentKeys.Event}.entityID`,
        } as const;
        const documentKey = keyPathMapping[query.predicate[0]];
        firestoreQuery = firestoreQuery.where(
          documentKey,
          mapQueryPredicateToFirestoreOp(query.predicate),
          query.predicate[2],
        );
      }
      docs = (await firestoreQuery.get()).docs;
    }

    return docs.map((doc) => doc.data()!.event);
  }

  async modifyEntities<E extends Entity, ID extends IDOfEntity<E>>(
    ids: ID[],
    transformer: (
      entityRecordMap: Map<ID, DatabaseBackendEntityRecord<E>>,
    ) => Promise<Map<ID, DatabaseBackendEntityRecord<E>>>,
  ): Promise<void> {
    // TODO: think carefully about possible races which could occur if multiple cloud functions are trying to update an entity snapshot at once. The transactions for putting the events and subsequently modifying the entities are separate. What's the failure mode, specifically? Is it worth guarding against?
    await this._database.runTransaction(async (tx) => {
      // Get the old entity records.
      const entityDocs = await this._getByID(
        this._getEntityCollectionRef(),
        ids,
        (ids) => tx.getAll(...ids),
      );

      // Call the transformer.
      const newEntityRecordMap = await transformer(
        getEntityRecordMapFromFirestoreDocs<E, ID>(entityDocs),
      );

      // Save the new entity records.
      const entityCollectionRef = this._getEntityCollectionRef();
      const creationTimestampsByID = new Map<ID, firestore.Timestamp>();
      for (const doc of entityDocs) {
        if (doc) {
          creationTimestampsByID.set(
            doc.entity.id as ID,
            doc.createdAtServerTimestamp,
          );
        }
      }
      for (const [id, newRecord] of newEntityRecordMap) {
        const ref = this._getEntityRef(id, entityCollectionRef);
        tx.set(
          ref,
          getEntityDocumentFromRecord(
            newRecord,
            creationTimestampsByID.get(id) ?? firestore.Timestamp.now(),
          ),
        );
      }
    });
  }

  async putEvents(events: Event[]): Promise<void> {
    const eventCollectionRef = this._getEventCollectionRef();
    await this._database.runTransaction(async (tx) => {
      // We only want to insert events that don't exist, so we fetch just the metadata for all the IDs specified.
      const eventSnapshots = await tx.getAll(
        ...events.map(({ id }) => this._getEventRef(id, eventCollectionRef)),
        { fieldMask: [] },
      );

      for (let i = 0; i < events.length; i++) {
        const snapshot = eventSnapshots[i];
        if (!snapshot.exists) {
          tx.create(snapshot.ref, {
            serverTimestamp: firestore.Timestamp.now(),
            event: events[i],
          });
        }
      }
    });
  }

  private async _getByID<D extends EntityDocument | EventDocument>(
    collectionRef: firestore.CollectionReference<D>,
    ids: string[],
    getAllImpl: (
      refs: firestore.DocumentReference[],
    ) => Promise<firestore.DocumentSnapshot[]>,
  ): Promise<(D | null)[]> {
    const refs = ids.map((id) =>
      collectionRef.doc(getFirebaseKeyFromStringHash(id)),
    );
    const eventSnapshots = await getAllImpl(refs);
    return eventSnapshots.map((snapshot) =>
      snapshot.exists ? (snapshot.data()! as D) : null,
    );
  }

  private _getUserDocumentRef() {
    return this._database.collection("users").doc(this._userID);
  }

  private _getEventCollectionRef<
    E extends Event = Event,
  >(): firestore.CollectionReference<EventDocument<E>> {
    return this._getUserDocumentRef().collection(
      "events",
    ) as firestore.CollectionReference<EventDocument<E>>;
  }

  private _getEntityCollectionRef<
    D extends EntityDocument,
  >(): firestore.CollectionReference<D> {
    return this._getUserDocumentRef().collection(
      "entities",
    ) as firestore.CollectionReference<D>;
  }

  private _getEventRef<E extends Event = Event>(
    eventID: EventID,
    collection = this._getEventCollectionRef(),
  ): firestore.DocumentReference<EventDocument<E>> {
    return collection.doc(
      getFirebaseKeyFromStringHash(eventID),
    ) as firestore.DocumentReference<EventDocument<E>>;
  }

  private _getEntityRef<D extends EntityDocument>(
    entityID: EntityID,
    collection = this._getEntityCollectionRef(),
  ): firestore.DocumentReference<D> {
    return collection.doc(
      getFirebaseKeyFromStringHash(entityID),
    ) as firestore.DocumentReference<D>;
  }
}

enum EventDocumentKeys {
  ServerTimestamp = "serverTimestamp",
  Event = "event",
}

interface EventDocument<E extends Event = Event> {
  [EventDocumentKeys.ServerTimestamp]: firestore.Timestamp;
  [EventDocumentKeys.Event]: E;
}

type EntityDocument = TaskDocument | EntityDocumentBase<AttachmentReference>;

enum EntityDocumentKeys {
  CreatedAtServerTimestamp = "createdAtServerTimestamp",
  Entity = "entity",
}
interface EntityDocumentBase<E extends Entity = Entity>
  extends DatabaseBackendEntityRecord<E> {
  [EntityDocumentKeys.CreatedAtServerTimestamp]: firestore.Timestamp;
  [EntityDocumentKeys.Entity]: E;
}

enum TaskDocumentKey {
  MinimumDueTimestampMillis = "minimumDueTimestampMillis",
}

interface TaskDocument extends EntityDocumentBase<Task> {
  [TaskDocumentKey.MinimumDueTimestampMillis]: number; // i.e. minimum over all task components, used for queries
}

function getEntityRecordFromFirestoreDoc<E extends Entity>(
  doc: TaskDocument | EntityDocumentBase<AttachmentReference>,
): DatabaseBackendEntityRecord<E> {
  return {
    entity: doc.entity as E,
    lastEventTimestampMillis: doc.lastEventTimestampMillis,
    lastEventID: doc.lastEventID,
  };
}

function getEntityRecordMapFromFirestoreDocs<
  E extends Entity,
  ID extends IDOfEntity<E>,
>(docs: (EntityDocument | null)[]): Map<ID, DatabaseBackendEntityRecord<E>> {
  const output = new Map<ID, DatabaseBackendEntityRecord<E>>();
  for (const doc of docs) {
    if (doc) {
      output.set(doc.entity.id as ID, getEntityRecordFromFirestoreDoc(doc));
    }
  }
  return output;
}

function getEntityDocumentFromRecord<
  E extends Entity,
  ID extends IDOfEntity<E>,
>(
  newRecord: [ID, DatabaseBackendEntityRecord<E>][1],
  createdAtServerTimestamp: firestore.Timestamp,
) {
  const entity: Entity = newRecord.entity;
  const entityDocumentBase: EntityDocumentBase = {
    entity: entity,
    lastEventID: newRecord.lastEventID,
    lastEventTimestampMillis: newRecord.lastEventTimestampMillis,
    createdAtServerTimestamp,
  };

  let newDocument: EntityDocument;
  switch (entity.type) {
    case EntityType.Task:
      const minimumDueTimestampMillis = Math.min(
        ...Object.values(entity.componentStates).map(
          ({ dueTimestampMillis }) => dueTimestampMillis,
        ),
      );
      if (isNaN(minimumDueTimestampMillis)) {
        throw new Error(
          `Unexpected component-less entity: ${JSON.stringify(entity)}`,
        );
      }
      newDocument = {
        ...entityDocumentBase,
        entity: entity,
        minimumDueTimestampMillis,
      };
      break;
    case EntityType.AttachmentReference:
      newDocument = { ...entityDocumentBase, entity: entity };
      break;
  }
  return newDocument;
}

function mapQueryPredicateToFirestoreOp(
  predicate: DatabaseQueryPredicate<any, any>,
): FirebaseFirestore.WhereFilterOp {
  return predicate[1] === "=" ? "==" : predicate[1];
}

// This function's used when we can't have Firestore do all the heavy lifting on the filtering itself. So we fetch results in pages, applying a predicate in memory and accumulating results until we hit the desired limit or run out of data.
async function fetchDocumentsWithPostQueryFilter<
  D extends EntityDocument | EventDocument,
>(
  baseQuery: firestore.Query<D>,
  filter: (document: D) => boolean,
  limit: number | null,
): Promise<firestore.DocumentSnapshot<D>[]> {
  const outputs: firestore.DocumentSnapshot<D>[] = [];
  let currentQuery = baseQuery.limit(Math.min(100, limit ?? Number.MAX_VALUE)); // We'll fetch small batches to avoid accumulating too many filtered-out results in memory.
  do {
    const batchSnapshots = await currentQuery.get();
    if (batchSnapshots.size > 0) {
      currentQuery = currentQuery.startAfter(
        batchSnapshots.docs[batchSnapshots.size - 1],
      );
      outputs.push(...batchSnapshots.docs.filter((doc) => filter(doc.data())));
    } else {
      break;
    }
  } while (limit === null || outputs.length < limit);
  return outputs;
}

function evaluateQueryPredicate<T extends Entity | Event>(
  object: T,
  predicate: T extends Entity
    ? NonNullable<DatabaseEntityQuery<T>["predicate"]>
    : T extends Event
    ? NonNullable<DatabaseEventQuery["predicate"]>
    : never,
): boolean {
  // @ts-ignore I can't convince TS that this is OK. But we're doing runtime checks here, so I'm not worried about it.
  const value = object[predicate[0]];
  if (value === undefined) {
    return false;
  }
  if (typeof value !== typeof predicate[2]) {
    throw new Error(
      `Object with ID ${object.id} and type ${
        object.type
      } has mistyped value for key ${
        predicate[0]
      }. Expected: ${typeof predicate[2]}. Actual: ${typeof value} (${value})`,
    );
  }

  switch (predicate[1]) {
    case "=":
      return value === predicate[2];
    case "<":
      return value < predicate[2];
    case "<=":
      return value <= predicate[2];
    case ">":
      return value > predicate[2];
    case ">=":
      return value >= predicate[2];
  }
}
