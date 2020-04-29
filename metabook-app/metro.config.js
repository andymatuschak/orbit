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

// Make react-native import from files in other workspace resolve to node_modules in this dir
config.resolver.extraNodeModules[
  "react-native"
] = `${__dirname}/node_modules/react-native`;

config.resolver.extraNodeModules["vm"] = require.resolve("vm-browserify");

// config.resolver.extraNodeModules["firebase/app"] = require.resolve(
//   "@react-native-firebase/app",
// );
// config.resolver.extraNodeModules["firebase/firestore"] = require.resolve(
//   "@react-native-firebase/firestore",
// );
// config.resolver.extraNodeModules["firebase/functions"] = require.resolve(
//   "@react-native-firebase/functions",
// );

// Default metro config
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: false,
  },
});

module.exports = config;
