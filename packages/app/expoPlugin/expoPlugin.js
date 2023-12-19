const {
  withEntitlementsPlist,
  withXcodeProject,
  IOSConfig,
} = require("expo/config-plugins");
const path = require("node:path");
const fs = require("node:fs");
const serviceConfig = require("../serviceConfig");

// We modify Expo's Continuous Native Generation for a few custom native features:
// * a custom URL scheme for attachments which should be resolved through the on-disk database
// * enabling macOS Catalyst builds

module.exports = function withOrbitExpoConfigPlugin(config) {
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;

    // adapted from https://www.sitepen.com/blog/doing-more-with-expo-using-custom-native-code
    const { projectName, projectRoot } = config.modRequest;
    const group = xcodeProject.pbxGroupByName(projectName);
    const key = xcodeProject.findPBXGroupKey({
      name: group.name,
      path: group.path,
    });

    const generatedSourceDir = path.dirname(
      IOSConfig.Paths.getAppDelegateFilePath(projectRoot),
    );

    const addSourceFile = (name) => {
      const src = path.resolve(__dirname, "ios", name);
      const dst = path.resolve(generatedSourceDir, name);
      fs.writeFileSync(dst, fs.readFileSync(src, "utf-8"));
      // Update the Xcode project data stored in the cfg object
      xcodeProject.addSourceFile(`${projectName}/${name}`, null, key);
    };

    // Add support for attachment URL scheme:
    addSourceFile("ORSQLImageURLLoader.h");
    addSourceFile("ORSQLImageURLLoader.m");

    // Enable Catalyst builds:
    xcodeProject.addToBuildSettings(
      "DEVELOPMENT_TEAM",
      serviceConfig.appleDevelopmentTeam,
    );
    xcodeProject.addToBuildSettings("SUPPORTS_MACCATALYST", "YES");
    xcodeProject.addToBuildSettings(
      "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD",
      "NO",
    );
    xcodeProject.addToBuildSettings("TARGETED_DEVICE_FAMILY", `"1,2,6"`);

    return config;
  });

  // Extra entitlements for Catalyst
  config = withEntitlementsPlist(config, async (config) => {
    config.modResults["com.apple.security.app-sandbox"] = true;
    config.modResults["com.apple.security.network.client"] = true;
    return config;
  });

  return config;
};
