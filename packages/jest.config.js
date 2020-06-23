module.exports = {
  globalSetup: "./metabook-firebase-support/__tests__/setup.ts",
  globalTeardown: "./metabook-firebase-support/__tests__/tearDown.ts",
  testEnvironment: "jest-environment-uint8array",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
