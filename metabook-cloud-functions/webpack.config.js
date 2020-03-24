const nodeExternals = require("webpack-node-externals");
const path = require("path");

var babelOptions = {
  presets: [
    [
      "@babel/preset-env",
      {
        targets: {
          node: "current",
        },
      },
    ],
  ],
};

module.exports = {
  entry: "./src",
  target: "node",
  mode: "development",
  externals: [nodeExternals()],
  output: {
    path: path.resolve(__dirname, "dist"),
    chunkFilename: "[id].js",
    libraryTarget: "commonjs",
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: babelOptions,
          },
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.js(x?)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "babel-loader",
            options: babelOptions,
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    modules: ["node_modules", "../node_modules"],
  },
};
