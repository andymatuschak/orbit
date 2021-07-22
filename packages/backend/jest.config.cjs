module.exports = {
  globals: {
    Uint8Array: Uint8Array, // use Node's implementation; https://github.com/facebook/jest/issues/4422
  },
  globalSetup: "./src/backend/firebaseSupport/__tests__/setup.ts",
  globalTeardown: "./src/backend/firebaseSupport/__tests__/teardown.ts",
  testEnvironment: "node",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  // Jest struggles to read these mappings from the multiformats packages, which seem to be specifying them just fine as far as I can tell.
  moduleNameMapper: {
    "^multiformats$": "multiformats/cjs/src/index.js",
    "^multiformats/(.+)$": "multiformats/cjs/src/$1.js",
    "^@ipld/dag-json": "@ipld/dag-json/cjs/index.js",
  },
};
