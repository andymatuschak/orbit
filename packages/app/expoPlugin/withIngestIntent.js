const {
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const { addSourceFile, addResourceFile } = require("./util");

module.exports = function withIngestIntent(config) {
  config = withXcodeProject(config, async (config) => {
    for (const file of [
      "IngestEventEmitter.h",
      "IngestEventEmitter.m",
      "IngestEventHandler.h",
      "IngestEventHandler.m",
      "Intents.intentdefinition",
    ]) {
      addSourceFile(config, file);
    }
    return config;
  });

  config = withAppDelegate(config, (config) => {
    const { contents } = config.modResults;
    const lines = contents.split("\n");

    const endIndex = lines.indexOf("@end");

    config.modResults.contents = `#import <Intents/Intents.h>
#import "IngestEventHandler.h"
${lines.slice(0, endIndex).join("\n")}
- (id)application:(UIApplication *)application handlerForIntent:(INIntent *)intent {
  if ([intent isKindOfClass:[ShortcutIngestIntent class]]) {
    return [[IngestEventHandler alloc] init];
  }
  return nil;
}

${lines.slice(endIndex).join("\n")}`;
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults["INIntentsSupported"] = ["ShortcutIngestIntent"];
    config.modResults["NSUserActivityTypes"] = ["ShortcutIngestIntent"];
    return config;
  });

  return config;
};
