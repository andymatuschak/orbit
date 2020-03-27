// This is a heinous hack handling Firebase's lack of support for persistence in a Node environment.
// Based on https://gist.github.com/zwily/e9e97e0f9f523a72c24c7df01d889482

import * as SQLite from "expo-sqlite";
import setGlobalVars from "./node_modules/@indexeddbshim/indexeddbshim/dist/indexeddbshim-noninvasive";

let isShimmed = false;
export default function shimFirebasePersistence(databaseBasePath) {
  if (isShimmed) {
    return;
  }
  isShimmed = true;

  window.openDatabase = SQLite.openDatabase;
  setGlobalVars(window, { checkOrigin: false, databaseBasePath });

  window.__localStorageStore = {};
  window.localStorage = {
    getItem: function (key) {
      console.info("getting Firebase local storage", key);
      return window.__localStorageStore[key];
    },
    setItem: function (key, value) {
      console.info("writing Firebase local storage", key, value);
      window.__localStorageStore[key] = value;
    },
    removeItem: function (key) {
      delete window.__localStorageStore[key];
    },
    clear: function () {
      window.__localStorageStore = {};
    },
    key: function (i) {
      // Assuming ES6 order-stable objects
      Object.keys(window.__localStorageStore)[i];
    },
  };

  process.env["USE_MOCK_PERSISTENCE"] = "YES";
}
