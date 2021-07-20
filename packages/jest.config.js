module.exports = {
  testEnvironment: "node",
  globals: {
    Uint8Array: Uint8Array, // use Node's implementation; https://github.com/facebook/jest/issues/4422
  },
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
