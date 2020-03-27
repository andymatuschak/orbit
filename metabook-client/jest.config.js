module.exports = {
  globalSetup: "./src/util/tests/setup.ts",
  globalTeardown: "./src/util/tests/teardown.ts",
  testEnvironment: "jest-environment-uint8array",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
