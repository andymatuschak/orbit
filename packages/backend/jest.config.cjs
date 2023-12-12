module.exports = {
  globals: {
    Uint8Array: Uint8Array, // use Node's implementation; https://github.com/facebook/jest/issues/4422
  },
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  testEnvironment: "node",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  transformIgnorePatterns: ["is-typedarray"],
};
