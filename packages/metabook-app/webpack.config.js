const createExpoWebpackConfigAsync = require("@expo/webpack-config");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");

module.exports = async function (env, argv) {
  const config = await createExpoWebpackConfigAsync(env, argv);

  if (process.env["ANALYZE"]) {
    config.plugins.push(
      new BundleAnalyzerPlugin({
        path: "web-report",
      }),
    );
  }

  return config;
};
