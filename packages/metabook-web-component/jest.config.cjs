module.exports = {
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["build", "public", "node_modules"],
  transformIgnorePatterns: [],
  transform: {
    "\\.[jt]s$": ["babel-jest", { cwd: __dirname }],
  },
  // Jest struggles to read these mappings from the multiformats packages, which seem to be specifying them just fine as far as I can tell.
  moduleNameMapper: {
    "^multiformats$": "multiformats/cjs/src/index.js",
    "^multiformats/(.+)$": "multiformats/cjs/src/$1.js",
    "^@ipld/dag-json": "@ipld/dag-json/cjs/index.js",
  },
};
