const {
  withEntitlementsPlist,
  withXcodeProject,
} = require("expo/config-plugins");

module.exports = function withCatalystSupport(config) {
  config = withXcodeProject(config, async (config) => {
    const xcodeProject = config.modResults;
    // Enable Catalyst builds:
    xcodeProject.addToBuildSettings("SUPPORTS_MACCATALYST", "YES");
    xcodeProject.addToBuildSettings(
      "SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD",
      "NO",
    );
    return config;
  });

  // Extra entitlements for Catalyst
  config = withEntitlementsPlist(config, async (config) => {
    config.modResults["com.apple.security.app-sandbox"] = true;
    config.modResults["com.apple.security.network.client"] = true;
    return config;
  });

  return config;
};
