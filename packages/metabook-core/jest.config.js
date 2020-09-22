module.exports = {
  testEnvironment: "jest-environment-uint8array",
  testMatch: ["**/?(*.)+(spec|test).ts?(x)"],
  testPathIgnorePatterns: ["dist", "node_modules"],
  moduleNameMapper: {
    "^multiformats$": "multiformats/cjs/src/index.js",
    "^multiformats/bases/base58$": "multiformats/cjs/src/bases/base58.js",
    "^multiformats/hashes/sha2": "multiformats/cjs/src/hashes/sha2.js",
    "^multiformats/codecs/raw": "multiformats/cjs/src/codecs/raw.js",
  },
};
