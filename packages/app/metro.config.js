/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const { createMetroConfiguration } = require("expo-yarn-workspaces");
const path = require("path");
const Resolver = require("metro-resolver");

const config = createMetroConfiguration(__dirname);

Object.assign(
  config.resolver.extraNodeModules,
  require("node-libs-react-native"),
);
config.resolver.extraNodeModules["vm"] = require.resolve("vm-browserify");

config.resolver.extraNodeModules["@react-native-firebase/app"] =
  require.resolve("@react-native-firebase/app");
config.resolver.extraNodeModules["@react-native-firebase/firestore"] =
  require.resolve("@react-native-firebase/firestore");
config.resolver.extraNodeModules["@react-native-firebase/functions"] =
  require.resolve("@react-native-firebase/functions");

// The multiformats package.json is malformed, so we have to help out resolution here.
config.resolver.resolveRequest = (
  context,
  realModuleName,
  platform,
  moduleName,
) => {
  if (moduleName === "multiformats") {
    return {
      filePath: path.resolve(
        __dirname,
        "../../node_modules/multiformats/cjs/src/index.js",
      ),
      type: "sourceFile",
    };
  } else if (moduleName.startsWith("multiformats")) {
    const [, ...rest] = moduleName.split("/");
    return {
      filePath: path.resolve(
        __dirname,
        `../../node_modules/multiformats/cjs/src/${rest.join("/")}.js`,
      ),
      type: "sourceFile",
    };
  } else if (moduleName === "@ipld/dag-json") {
    return {
      filePath: path.resolve(
        __dirname,
        "../../node_modules/@ipld/dag-json/cjs/index.js",
      ),
      type: "sourceFile",
    };
  } else {
    return Resolver.resolve(
      { ...context, resolveRequest: undefined },
      realModuleName,
      platform,
    );
  }
};

// Make react-native import from files in other workspace resolve to node_modules in this dir
config.resolver.extraNodeModules[
  "react-native"
] = `${__dirname}/node_modules/react-native`;

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: false,
  },
});

config.transformer.assetPlugins = ["expo-asset/tools/hashAssetFiles"];

module.exports = config;
