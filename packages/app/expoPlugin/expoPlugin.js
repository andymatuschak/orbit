const { withPlugins } = require("expo/config-plugins");
const serviceConfig = require("../serviceConfig");
const withSQLImageURLLoader = require("./withSQLImageURLLoader");
const withCatalystSupport = require("./withCatalystSupport");
const withIngestIntent = require("./withIngestIntent");

module.exports = function withOrbitExpoConfigPlugin(config) {
  return withPlugins(config, [
    [
      withCatalystSupport,
      { developmentTeamID: serviceConfig.appleDevelopmentTeamID },
    ],
    withSQLImageURLLoader,
    withIngestIntent,
  ]);
};
