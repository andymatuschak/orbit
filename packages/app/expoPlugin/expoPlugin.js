const { withPlugins } = require("expo/config-plugins");
const serviceConfig = require("../serviceConfig");
const withCatalystSupport = require("./withCatalystSupport");
const withIngestIntent = require("./withIngestIntent");
const withReactNativeKeyEventSupport = require("./withReactNativeKeyEventSupport");
const withSQLImageURLLoader = require("./withSQLImageURLLoader");

module.exports = function withOrbitExpoConfigPlugin(config) {
  return withPlugins(config, [
    [
      withCatalystSupport,
      { developmentTeamID: serviceConfig.appleDevelopmentTeamID },
    ],
    withIngestIntent,
    withSQLImageURLLoader,
    withReactNativeKeyEventSupport,
  ]);
};
