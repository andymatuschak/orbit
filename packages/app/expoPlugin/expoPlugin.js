const { withPlugins } = require("expo/config-plugins");
const withCatalystSupport = require("./withCatalystSupport");
const withIngestIntent = require("./withIngestIntent");
const withSQLImageURLLoader = require("./withSQLImageURLLoader");
const withWidgetPluginFixes = require("./withWidgetPluginFixes");

module.exports = function withOrbitExpoConfigPlugin(config) {
  return withPlugins(config, [
    withCatalystSupport,
    withIngestIntent,
    withSQLImageURLLoader,
    withWidgetPluginFixes,
  ]);
};
