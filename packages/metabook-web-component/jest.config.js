module.exports = {
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["build", "public", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
};
