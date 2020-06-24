module.exports = {
  testEnvironment: "jest-environment-uint8array",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["build", "public", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
