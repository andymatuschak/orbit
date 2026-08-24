const { withInfoPlist, withPlugins } = require("expo/config-plugins");
const withCatalystSupport = require("./withCatalystSupport");
const withSQLImageURLLoader = require("./withSQLImageURLLoader");
const withWidgetPluginFixes = require("./withWidgetPluginFixes");

module.exports = function withOrbitExpoConfigPlugin(config) {
  config = withPlugins(config, [
    withCatalystSupport,
    withSQLImageURLLoader,
    withWidgetPluginFixes,
  ]);

  // Expo currently emits this deprecated key even when it is false. An iOS
  // 26-only app participates in iPad windowing without it.
  return withInfoPlist(config, (config) => {
    delete config.modResults.UIRequiresFullScreen;
    return config;
  });
};
