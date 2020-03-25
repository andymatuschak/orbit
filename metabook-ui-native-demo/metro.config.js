/**
 * Metro configuration for React Native
 * https://github.com/facebook/react-native
 *
 * @format
 */

const {createMetroConfiguration} = require('expo-yarn-workspaces');

const config = createMetroConfiguration(__dirname);

// Make react-native import from files in other workspace resolve to node_modules in this dir
config.resolver.extraNodeModules[
  'react-native'
] = `${__dirname}/node_modules/react-native`;

// Default metro config
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: false,
  },
});

module.exports = config;
