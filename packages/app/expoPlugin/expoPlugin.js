const { withXcodeProject, IOSConfig } = require("expo/config-plugins");
const path = require("node:path");
const fs = require("node:fs");

// We modify Expo's Continuous Native Generation for a few custom native features:
// * a custom URL scheme for attachments which should be resolved through the on-disk database

module.exports = function withOrbitExpoConfigPlugin(config) {
  return withXcodeProject(config, async (config) => {
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

    addSourceFile("ORSQLImageURLLoader.h");
    addSourceFile("ORSQLImageURLLoader.m");
    return config;
  });
};
