// This is a locus of pain. Browsers can indicate the practical unavailability of IndexedDB in many ways: sometimes by making the API unavailable, sometimes by making open() throw, sometimes by making writes throw.

let browserStorageAvailable: boolean | null = null;

function indexedDBExists() {
  return "indexedDB" in self && indexedDB != null;
}
const testDB = "__orbit_validateIDB";
const storeName = "testStore";

function attemptTestObjectStoreWrite(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve) => {
    // Create a transaction we'll use to test write.
    const transaction = db.transaction(storeName, "readwrite");

    // When the transaction's done, clean up.
    transaction.oncomplete = () => {
      resolve(true);
    };
    transaction.onerror = () => {
      console.log("Couldn't commit IDB read/write transaction");
      resolve(false);
    };

    // Put a test key/value into the database.
    const store = transaction.objectStore(storeName);
    try {
      store.put("testValue", "testKey");
    } catch (error) {
      console.log("Couldn't put() in IDB object store", error);
      resolve(false);
    }
  });
}

function performTest(openRequest: IDBOpenDBRequest): Promise<boolean> {
  const db = openRequest.result;

  // Make an object store to test mutations.
  const store = db.createObjectStore(storeName);

  return new Promise((resolve) => {
    store.transaction.oncomplete = () => {
      attemptTestObjectStoreWrite(db).then(resolve);
    };
    store.transaction.onerror = () => {
      console.log("Couldn't create IDB object store");
      resolve(false);
    };
  });
}

function cleanUpTestDB(db: IDBDatabase) {
  try {
    db.deleteObjectStore(storeName);
    db.close();
    window.indexedDB.deleteDatabase(storeName);
  } catch {
    // We don't care about these clean-up errors.
  }
}

async function canWriteToIndexedDB(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      // IDB is so baroque. First we open the database...
      const openRequest = window.indexedDB.open(testDB);

      let dbAlreadyExisted = false;

      // It shouldn't exist, so we'll need to "upgrade" it.
      openRequest.onupgradeneeded = () => {
        dbAlreadyExisted = true;
        performTest(openRequest).then(resolve);
      };

      // Once that upgrade's complete, clean up and resolve.
      openRequest.onsuccess = () => {
        const db = openRequest.result;
        if (dbAlreadyExisted) {
          cleanUpTestDB(db);
        } else {
          attemptTestObjectStoreWrite(db).then((result) => {
            resolve(result);
            cleanUpTestDB(db);
          });
        }
      };
      openRequest.onerror = () => {
        console.log("Couldn't open test IDB database");
        resolve(false);
      };
    } catch (error) {
      console.log("Exception opening test IDB", error);
      resolve(false);
    }
  });
}

export default async function isBrowserStorageAvailable(): Promise<boolean> {
  if (browserStorageAvailable === null) {
    browserStorageAvailable =
      indexedDBExists() && (await canWriteToIndexedDB());
    if (!browserStorageAvailable) {
      console.log("[Orbit] Browser storage is not available");
    }
  }
  return browserStorageAvailable;
}
