const { createWebpackConfigAsync } = require('expo-yarn-workspaces/webpack');
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

module.exports = async function (env, argv) {
  const config = await createWebpackConfigAsync(
    { ...env, offline: false },
    argv,
  );

  if (process.env["ANALYZE"]) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        path: "web-report",
      }),
    );
  }

  return config;
};
