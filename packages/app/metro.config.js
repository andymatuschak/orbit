/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const { createMetroConfiguration } = require("expo-yarn-workspaces");
const config = createMetroConfiguration(__dirname);

Object.assign(
  config.resolver.extraNodeModules,
  require("node-libs-react-native"),
);
config.resolver.extraNodeModules["vm"] = require.resolve("vm-browserify");

config.resolver.extraNodeModules["@react-native-firebase/app"] =
  require.resolve("@react-native-firebase/app");

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
