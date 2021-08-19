module.exports = {
  globals: {
    Uint8Array: Uint8Array, // use Node's implementation; https://github.com/facebook/jest/issues/4422
  },
  globalSetup: "./src/__tests__/setup.ts",
  globalTeardown: "./src/__tests__/teardown.ts",
  testEnvironment: "node",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
};
