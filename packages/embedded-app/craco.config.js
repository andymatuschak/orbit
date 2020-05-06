const fs = require("fs");
const path = require("path");
const rewireBabelLoader = require("craco-babel-loader");

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
    },
    webpack: {
      alias: {
        // metabook-ui should use the local react, not its own.
        react: resolveApp("node_modules/react"),
        "react-dom": resolveApp("node_modules/react-dom"),
      },
    },
  };
};
