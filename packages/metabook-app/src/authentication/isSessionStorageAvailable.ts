let sessionStorageAvailable: boolean | null = null;

export default function isSessionStorageAvailable() {
  if (sessionStorageAvailable === null) {
    let storage;
    try {
      storage = window.sessionStorage;
      const x = "__storage_test__";
      storage.setItem(x, x);
      storage.removeItem(x);
      sessionStorageAvailable = true;
    } catch (e) {
      sessionStorageAvailable = !!(
        e instanceof DOMException &&
        // everything except Firefox
        (e.code === 22 ||
          // Firefox
          e.code === 1014 ||
          // test name field too, because code might not be present
          // everything except Firefox
          e.name === "QuotaExceededError" ||
          // Firefox
          e.name === "NS_ERROR_DOM_QUOTA_REACHED") &&
        // acknowledge QuotaExceededError only if there's something already stored
        storage &&
        storage.length !== 0
      );
    }
  }
  return sessionStorageAvailable;
}
