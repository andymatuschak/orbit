const fs = require("fs");
const path = require("path");
const rewireBabelLoader = require("craco-babel-loader");
const webpack = require("webpack");

const isDevelopment = process.env["NODE_ENV"] === "development";
const userID = isDevelopment
  ? process.env["ORBIT_USER_ID"]
    ? process.env["ORBIT_USER_ID"]
    : "x5EWk2UT56URxbfrl7djoxwxiqH2"
  : null;

const resolveApp = (relativePath) => path.resolve(__dirname, relativePath);

module.exports = function ({ env }) {
  return {
    plugins: [
      {
        plugin: rewireBabelLoader,
        options: {
          includes: [
            resolveApp("../metabook-core"),
            resolveApp("../metabook-ui"),
          ],
        },
      },
    ],
    babel: {
      presets: ["@babel/preset-env", "@babel/preset-react"],
      plugins: [
        "babel-plugin-transform-class-properties",
        ["babel-plugin-react-native-web", { commonjs: true }],
      ],
      loaderOptions: (options) => {
        options.sourceType = "unambiguous";
        return options;
      },
    },
    webpack: {
      alias: {
        // metabook-ui should use the local react, not its own.
        react: resolveApp("node_modules/react"),
        "react-dom": resolveApp("node_modules/react-dom"),
        "react-native-web": resolveApp("node_modules/react-native-web"),
      },
      plugins: [
        new webpack.DefinePlugin({
          USER_ID: JSON.stringify(userID),
        }),
      ],
    },
  };
};