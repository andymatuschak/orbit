const { withInfoPlist, withXcodeProject } = require("expo/config-plugins");
const { addSourceFile, addResourceFile } = require("./util");

module.exports = function withIngestIntent(config) {
  config = withXcodeProject(config, async (config) => {
    for (const file of [
      "IngestEventEmitter.h",
      "IngestEventEmitter.m",
      "IngestEventHandler.h",
      "IngestEventHandler.m",
      "Intents.intentdefinition",
      "AppDelegate+Intents.m",
    ]) {
      addSourceFile(config, file);
    }
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults["INIntentsSupported"] = ["ShortcutIngestIntent"];
    config.modResults["NSUserActivityTypes"] = ["ShortcutIngestIntent"];
    return config;
  });

  return config;
};
