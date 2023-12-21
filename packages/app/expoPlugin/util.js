const path = require("node:path");
const { IOSConfig } = require("expo/config-plugins");
const fs = require("node:fs");

function addFile(config, name, fn) {
  // adapted from https://www.sitepen.com/blog/doing-more-with-expo-using-custom-native-code
  const xcodeProject = config.modResults;
  const { projectName, projectRoot } = config.modRequest;
  const group = xcodeProject.pbxGroupByName(projectName);
  const key = xcodeProject.findPBXGroupKey({
    name: group.name,
    path: group.path,
  });

  const generatedSourceDir = path.dirname(
    IOSConfig.Paths.getAppDelegateFilePath(projectRoot),
  );

  const src = path.resolve(__dirname, "ios", name);
  const dst = path.resolve(generatedSourceDir, name);
  fs.writeFileSync(dst, fs.readFileSync(src, "utf-8"));

  fn(`${projectName}/${name}`, key);
}

function addSourceFile(config, name) {
  addFile(config, name, (path, key) => {
    config.modResults.addSourceFile(path, null, key);
  });
}

function addResourceFile(config, filename) {
  addFile(config, filename, (path, key) => {
    config.modResults.addResourceFile(path, null, key);
  });
}

module.exports = { addSourceFile, addResourceFile };
