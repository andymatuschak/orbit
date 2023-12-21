const { withXcodeProject, IOSConfig } = require("expo/config-plugins");
const { addSourceFile } = require("./util");

// Attachments are stored as blobs in the Orbit SQLite database. We use a custom URL to specify images to the React Native <Image> tag; this resolver provides the data on demand.
module.exports = function withSQLImageURLLoader(config) {
  return withXcodeProject(config, async (config) => {
    addSourceFile(config, "ORSQLImageURLLoader.h");
    addSourceFile(config, "ORSQLImageURLLoader.m");
    return config;
  });
};
