import {
  AttachmentReference,
  Entity,
  EntityID,
  EntityType,
  Event,
  EventForEntity,
  EventID,
  IDOfEntity,
  Task,
} from "@withorbit/core";
import {
  DatabaseBackend,
  DatabaseBackendEntityRecord,
  DatabaseEntityQuery,
  DatabaseEventQuery,
  DatabaseQueryPredicate,
} from "@withorbit/store-shared";
import * as Firestore from "firebase-admin/firestore";
import { getDatabase } from "./firestore.js";
import { WithFirebaseFields } from "./withFirebaseFields.js";
import {
  compareOrderedIDs,
  OrderedID,
  OrderedIDGenerator,
} from "./orderedID.js";
import { UserMetadata } from "./userMetadata.js";

export class FirestoreDatabaseBackend implements DatabaseBackend {
  private readonly _userID: string;
  private readonly _database: Firestore.Firestore;
  private readonly _orderedIDGenerator: OrderedIDGenerator;

  constructor(userID: string, database: Firestore.Firestore = getDatabase()) {
    this._userID = userID;
    this._database = database;
    this._orderedIDGenerator = new OrderedIDGenerator();
  }

  async close(): Promise<void> {
    await this._database.terminate();
  }

  async getEntities<E extends Entity, ID extends IDOfEntity<E>>(
    entityIDs: ID[],
  ): Promise<Map<ID, DatabaseBackendEntityRecord<E>>> {
    const docs = await this._getByID<EntityDocumentBase<E>>(
      this._getEntityCollectionRef<EntityDocumentBase<E>>(),
      entityIDs,
      (ids) => this._database.getAll(...ids),
    );
    return getEntityRecordMapFromFirestoreDocs<E, ID>(docs);
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
    const entityTypeKeyPath: `${EntityDocumentKey.Entity}.${keyof Entity}` =
      `${EntityDocumentKey.Entity}.type` as const;

    const docs = await this._listDocuments<
      EntityDocumentBase<E>,
      EntityDocumentKey | TaskDocumentKey,
      DatabaseEntityQuery<E>,
      IDOfEntity<E>
    >({
      query,
      baseFirestoreQuery: this._getEntityCollectionRef().where(
        entityTypeKeyPath,
        "==",
        query.entityType,
      ) as Firestore.Query<EntityDocumentBase<E>>,
      getDocRefByObjectID: (id) =>
        this._getEntityRef<EntityDocumentBase<E>>(id),
      orderedIDKey: EntityDocumentKey.OrderedID,
      getDocKeyForQueryPredicate: (predicate) =>
        ({
          dueTimestampMillis: TaskDocumentKey.MinimumDueTimestampMillis,
        }[predicate[0]]),
      getDocOrderedID: (doc) => doc.orderedID,
      getDocObjectID: (doc) =>
        doc[EntityDocumentKey.Entity].id as IDOfEntity<E>,
    });
    return docs.map((doc) => getEntityRecordFromFirestoreDoc(doc));
  }

  async listEvents(query: DatabaseEventQuery): Promise<Event[]> {
    const docs = await this._listDocuments<
      EventDocument,
      EventDocumentKeyPath,
      DatabaseEventQuery,
      EventID
    >({
      query,
      baseFirestoreQuery: this._getEventCollectionRef(),
      getDocRefByObjectID: (id) => this._getEventRef(id),
      orderedIDKey: EventDocumentKey.OrderedID,
      getDocKeyForQueryPredicate: (predicate) =>
        ((
          {
            entityID: `${EventDocumentKey.Event}.entityID`,
          } as const
        )[predicate[0]]),
      getDocOrderedID: (doc) => doc.orderedID,
      getDocObjectID: (doc) => doc[EventDocumentKey.Event].id,
    });
    return docs.map((doc) => doc.event);
  }

  private async _listDocuments<
    D extends EntityDocumentBase | EventDocument,
    DK extends D extends EntityDocumentBase<any>
      ? EntityDocumentKey | TaskDocumentKey
      : EventDocumentKeyPath,
    Q extends D extends EntityDocumentBase<infer ET>
      ? DatabaseEntityQuery<ET>
      : DatabaseEventQuery,
    OID extends D extends EntityDocumentBase<infer ET>
      ? IDOfEntity<ET>
      : EventID,
  >({
    query,
    orderedIDKey,
    baseFirestoreQuery,
    getDocRefByObjectID,
    getDocKeyForQueryPredicate,
    getDocOrderedID,
    getDocObjectID,
  }: {
    query: Q;
    orderedIDKey: DK;
    baseFirestoreQuery: Firestore.Query<D>;
    getDocRefByObjectID: (id: OID) => Firestore.DocumentReference<D>;
    getDocKeyForQueryPredicate: (
      predicate: Exclude<Q["predicate"], undefined>,
    ) => DK;
    getDocOrderedID: (doc: D) => OrderedID;
    getDocObjectID: (doc: D) => OID;
  }): Promise<D[]> {
    const afterDocumentSnapshot = query.afterID
      ? await getDocRefByObjectID(query.afterID as OID).get()
      : null;
    if (afterDocumentSnapshot && !afterDocumentSnapshot.exists) {
      throw new Error(`Unknown afterID ${query.afterID}`);
    }

    if (query.predicate) {
      baseFirestoreQuery = baseFirestoreQuery.where(
        getDocKeyForQueryPredicate(
          query.predicate as Exclude<Q["predicate"], undefined>,
        ),
        mapQueryPredicateToFirestoreOp(query.predicate),
        query.predicate[2],
      );
    }

    let docs: Firestore.DocumentSnapshot<D>[];
    // So long as there's no predicate, or the predicate is simple equality, we can arrange our indexes to support efficient query and ordering by OrderedID. But if it's a range predicate, we have to use an index based just on the predicate key, then do an in-memory sort, offset, and limit on the OrderedID. This makes paging quadratic in time cost.
    if (!query.predicate || query.predicate[1] === "=") {
      baseFirestoreQuery = baseFirestoreQuery.orderBy(orderedIDKey);
      if (query.afterID) {
        baseFirestoreQuery = baseFirestoreQuery.startAfter(
          afterDocumentSnapshot,
        );
      }
      if (query.limit !== undefined) {
        baseFirestoreQuery = baseFirestoreQuery.limit(query.limit);
      }
      docs = (await baseFirestoreQuery.get()).docs;
    } else {
      baseFirestoreQuery = baseFirestoreQuery.orderBy(
        getDocKeyForQueryPredicate(
          query.predicate as Exclude<Q["predicate"], undefined>,
        ),
      );

      const allDocsMatchingPredicate = (await baseFirestoreQuery.get()).docs;

      allDocsMatchingPredicate.sort((a, b) =>
        compareOrderedIDs(getDocOrderedID(a.data()), getDocOrderedID(b.data())),
      );
      if (afterDocumentSnapshot) {
        const afterDocIndex = allDocsMatchingPredicate.findIndex(
          (doc) => getDocObjectID(doc.data()) === query.afterID,
        );
        if (afterDocIndex === -1) {
          throw new Error(
            `afterID document unexpectedly disappeared: ${query.afterID}`,
          );
        }
        docs = allDocsMatchingPredicate.slice(
          afterDocIndex + 1,
          query.limit === undefined
            ? undefined
            : afterDocIndex + 1 + query.limit,
        );
      } else if (query.limit === undefined) {
        docs = allDocsMatchingPredicate;
      } else {
        docs = allDocsMatchingPredicate.slice(0, query.limit);
      }
    }

    return docs.map((doc) => doc.data()!);
  }

  async updateEntities<E extends Entity>(
    events: EventForEntity<E>[],
    transformer: (
      eventsPendingSave: EventForEntity<E>[],
      entityRecordMap: Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>,
    ) => Promise<Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>>,
  ): Promise<void> {
    await this._database.runTransaction(async (tx) => {
      // Get the old entity records.
      const entityIDs = new Set(events.map(({ entityID }) => entityID));
      const entityDocs = await this._getByID<EntityDocumentBase<E>>(
        this._getEntityCollectionRef(),
        [...entityIDs],
        (ids) => tx.getAll(...ids),
      );

      // We only want to insert events that don't exist, so we fetch just the metadata for all the IDs specified.
      const eventCollectionRef = this._getEventCollectionRef();
      const eventSnapshots = await tx.getAll(
        ...events.map(({ id }) => this._getEventRef(id, eventCollectionRef)),
        { fieldMask: [] },
      );
      const newEvents = events.filter(
        (_event, index) => !eventSnapshots[index].exists,
      );

      // Call the transformer.
      const oldEntityRecordMap = getEntityRecordMapFromFirestoreDocs<
        E,
        IDOfEntity<E>
      >(entityDocs);
      const newEntityRecordMap = await transformer(
        newEvents,
        oldEntityRecordMap,
      );

      // Save the new entity records.
      const entityCollectionRef = this._getEntityCollectionRef();
      const orderedIDsByEntityID = new Map<IDOfEntity<E>, OrderedID>();
      for (const doc of entityDocs) {
        if (doc) {
          orderedIDsByEntityID.set(
            doc.entity.id as IDOfEntity<E>,
            doc.orderedID,
          );
        }
      }
      for (const [id, newRecord] of newEntityRecordMap) {
        const ref = this._getEntityRef(id, entityCollectionRef);
        tx.set(
          ref,
          getEntityDocumentFromRecord(
            newRecord,
            orderedIDsByEntityID.get(id) ??
              this._orderedIDGenerator.getOrderedID(),
          ) as EntityDocumentBase,
        );
      }
      this._onEntityUpdates(oldEntityRecordMap, newEntityRecordMap, tx);

      // Save the new events.
      for (let i = 0; i < events.length; i++) {
        const eventSnapshot = eventSnapshots[i];
        if (!eventSnapshot.exists) {
          tx.create(eventSnapshot.ref, {
            orderedID: this._orderedIDGenerator.getOrderedID(),
            event: events[i],
          });
        }
      }
    });
  }

  getMetadataValues<Key extends string>(): Promise<Map<Key, string>> {
    throw new Error("Unimplemented; should not be called.");
  }

  setMetadataValues(): Promise<void> {
    throw new Error("Unimplemented; should not be called.");
  }

  private _onEntityUpdates<E extends Entity>(
    oldRecordMap: Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>,
    newRecordMap: Map<IDOfEntity<E>, DatabaseBackendEntityRecord<E>>,
    transaction: Firestore.Transaction,
  ) {
    let taskCountDelta = 0;
    let taskUpdateCount = 0;

    for (const [id, record] of newRecordMap) {
      const { entity } = record;
      if (entity.type === EntityType.Task) {
        taskUpdateCount++;
        const taskWasActive = isTaskActive(
          (oldRecordMap.get(id)?.entity ?? null) as Task | null,
        );
        const taskIsActive = isTaskActive(entity as Task);
        taskCountDelta +=
          !taskWasActive && taskIsActive
            ? 1
            : taskWasActive && !taskIsActive
            ? -1
            : 0;
      }
    }

    if (taskUpdateCount > 0) {
      const metadataUpdate: WithFirebaseFields<Partial<UserMetadata>> = {
        ...(taskCountDelta !== 0 && {
          activeTaskCount: Firestore.FieldValue.increment(taskCountDelta),
        }),
        sessionNotificationState: Firestore.FieldValue.delete(),
      };
      transaction.set(
        this._getUserDocumentRef(),
        metadataUpdate as UserMetadata,
        { merge: true },
      );
    }
  }

  private async _getByID<D extends EntityDocumentBase | EventDocument>(
    collectionRef: Firestore.CollectionReference<D>,
    ids: string[],
    getAllImpl: (
      refs: Firestore.DocumentReference[],
    ) => Promise<Firestore.DocumentSnapshot[]>,
  ): Promise<(D | null)[]> {
    const refs = ids.map((id) => collectionRef.doc(id));
    const eventSnapshots = await getAllImpl(refs);
    return eventSnapshots.map((snapshot) =>
      snapshot.exists ? (snapshot.data()! as D) : null,
    );
  }

  private _getUserDocumentRef() {
    return this._database
      .collection("users")
      .doc(this._userID) as Firestore.DocumentReference<UserMetadata>;
  }

  private _getEventCollectionRef<
    E extends Event = Event,
  >(): Firestore.CollectionReference<EventDocument<E>> {
    return this._getUserDocumentRef().collection(
      "events",
    ) as Firestore.CollectionReference<EventDocument<E>>;
  }

  private _getEntityCollectionRef<
    D extends EntityDocumentBase,
  >(): Firestore.CollectionReference<D> {
    return this._getUserDocumentRef().collection(
      "entities",
    ) as Firestore.CollectionReference<D>;
  }

  private _getEventRef<E extends Event = Event>(
    eventID: EventID,
    collection = this._getEventCollectionRef(),
  ): Firestore.DocumentReference<EventDocument<E>> {
    return collection.doc(eventID) as Firestore.DocumentReference<
      EventDocument<E>
    >;
  }

  private _getEntityRef<D extends EntityDocumentBase>(
    entityID: EntityID,
    collection = this._getEntityCollectionRef(),
  ): Firestore.DocumentReference<D> {
    return collection.doc(entityID) as Firestore.DocumentReference<D>;
  }
}

enum EventDocumentKey {
  OrderedID = "orderedID",
  Event = "event",
}

type EventDocumentKeyPath =
  | EventDocumentKey
  | `${EventDocumentKey.Event}.${keyof Event}`;

interface EventDocument<E extends Event = Event> {
  [EventDocumentKey.OrderedID]: OrderedID;
  [EventDocumentKey.Event]: E;
}

type EntityDocument = TaskDocument | EntityDocumentBase<AttachmentReference>;

enum EntityDocumentKey {
  OrderedID = "orderedID",
  Entity = "entity",
}
interface EntityDocumentBase<E extends Entity = Entity>
  extends DatabaseBackendEntityRecord<E> {
  [EntityDocumentKey.OrderedID]: OrderedID;
  [EntityDocumentKey.Entity]: E;
}

enum TaskDocumentKey {
  MinimumDueTimestampMillis = "minimumDueTimestampMillis",
}

interface TaskDocument extends EntityDocumentBase<Task> {
  [TaskDocumentKey.MinimumDueTimestampMillis]: number; // i.e. minimum over all task components, used for queries
}

function getEntityRecordFromFirestoreDoc<E extends Entity>(
  doc: EntityDocumentBase<E>,
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
>(
  docs: (EntityDocumentBase<E> | null)[],
): Map<ID, DatabaseBackendEntityRecord<E>> {
  const output = new Map<ID, DatabaseBackendEntityRecord<E>>();
  for (const doc of docs) {
    if (doc) {
      output.set(doc.entity.id as ID, getEntityRecordFromFirestoreDoc(doc));
    }
  }
  return output;
}

function getEntityDocumentFromRecord<E extends Entity>(
  newRecord: DatabaseBackendEntityRecord<E>,
  orderedID: OrderedID,
): EntityDocument {
  const entity: Entity = newRecord.entity;
  const entityDocumentBase: EntityDocumentBase = {
    entity: entity,
    lastEventID: newRecord.lastEventID,
    lastEventTimestampMillis: newRecord.lastEventTimestampMillis,
    orderedID,
  };

  let newDocument: EntityDocument;
  switch (entity.type) {
    case EntityType.Task:
      const minimumDueTimestampMillis = entity.isDeleted
        ? Number.MAX_SAFE_INTEGER
        : Math.min(
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
  predicate: DatabaseQueryPredicate,
): FirebaseFirestore.WhereFilterOp {
  return predicate[1] === "=" ? "==" : predicate[1];
}

function isTaskActive(task: Task | null): boolean {
  return !!task && !task.isDeleted;
}
