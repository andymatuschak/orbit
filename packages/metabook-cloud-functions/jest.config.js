module.exports = {
  globalSetup: "../metabook-firebase-support/src/__tests__/setup.ts",
  globalTeardown: "../metabook-firebase-support/src/__tests__/teardown.ts",
  testEnvironment: "jest-environment-uint8array",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
