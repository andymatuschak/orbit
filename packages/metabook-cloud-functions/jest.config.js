module.exports = {
  globalSetup: "./src/__tests__/setup.ts",
  globalTeardown: "./src/__tests__/teardown.ts",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
