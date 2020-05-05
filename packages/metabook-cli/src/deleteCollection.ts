import admin from "firebase-admin";

function deleteQueryBatch(
  db: admin.firestore.Firestore,
  query: admin.firestore.Query,
  resolve: (value?: unknown) => void,
  reject: (error: Error) => void,
) {
  query
    .get()
    .then((snapshot) => {
      // When there are no documents left, we are done
      if (snapshot.size === 0) {
        return 0;
      }

      // Delete documents in a batch
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      return batch.commit().then(() => {
        return snapshot.size;
      });
    })
    .then((numDeleted) => {
      if (numDeleted === 0) {
        resolve();
        return;
      }

      // Recurse on the next process tick, to avoid
      // exploding the stack.
      process.nextTick(() => {
        deleteQueryBatch(db, query, resolve, reject);
      });
    })
    .catch(reject);
}

export function deleteCollection(
  db: admin.firestore.Firestore,
  collectionRef: admin.firestore.CollectionReference,
  batchSize = 500,
) {
  const query = collectionRef.orderBy("__name__").limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}
