module.exports = {
  globalSetup: "./src/util/tests/setup.ts",
  globalTeardown: "./src/util/tests/teardown.ts",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
};
