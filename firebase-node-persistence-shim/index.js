// This is a heinous hack handling Firebase's lack of support for persistence in a Node environment.
// Based on https://gist.github.com/zwily/e9e97e0f9f523a72c24c7df01d889482

require("babel-polyfill");
const setGlobalVars = require("indexeddbshim/dist/indexeddbshim-noninvasive");
const websql = require("websql");

let isShimmed = false;
export default async function shimFirebasePersistence() {
  if (isShimmed) {
    return;
  }
  isShimmed = true;

  process.env["USE_MOCK_PERSISTENCE"] = "YES";

  if (typeof window === "undefined") {
    window = {};
  }

  window.openDatabase = websql;

  if (typeof navigator === "undefined") {
    navigator = {};
  }
  Object.defineProperty(navigator, "userAgent", {
    value: "Metabook Client",
    writable: false,
  });

  const os = (await import("os")).default;
  window.shimNS = true;

  setGlobalVars(window, { checkOrigin: false, databaseBasePath: os.tmpdir() });

  window.__localStorageStore = {};
  window.localStorage = {
    getItem: function(key) {
      return window.__localStorageStore[key];
    },
    setItem: function(key, value) {
      console.info("local storage", key, value);
      window.__localStorageStore[key] = value;
    },
    removeItem: function(key) {
      delete window.__localStorageStore[key];
    },
    clear: function() {
      window.__localStorageStore = {};
    },
    key: function(i) {
      // Assuming ES6 order-stable objects
      Object.keys(window.__localStorageStore)[i];
    },
  };
}
