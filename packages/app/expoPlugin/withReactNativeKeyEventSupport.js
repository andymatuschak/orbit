const { withXcodeProject } = require("expo/config-plugins");
const { addSourceFile, addResourceFile } = require("./util");

module.exports = function withReactNativeKeyEventSupport(config) {
  return withXcodeProject(config, async (config) => {
    addSourceFile(config, "AppDelegate+KeyHandling.m");
    return config;
  });
};
