const path = require("path");
const process = require("process");
const webpack = require("webpack");

const isDevelopment = process.env["NODE_ENV"] === "development";
const useLocalServer =
  process.env["USE_LOCAL_SERVER"] === undefined
    ? isDevelopment
    : process.env["USE_LOCAL_SERVER"];

module.exports = {
  entry: "./src/index.ts",
  devtool: "source-map",
  mode: isDevelopment ? "development" : "production",
  module: {
    noParse: /react-native/,
    rules: [
      {
        test: /\.js$/,
        use: "babel-loader",
        include: [/node_modules/, /withorbit/],
        exclude: [/node_modules\/react-native/],
      },
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  output: {
    filename: "orbit-web-component.js",
    path: path.resolve(__dirname, "build"),
    module: true,
  },
  experiments: {
    outputModule: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      EMBED_API_BASE_URL: JSON.stringify(
        useLocalServer
          ? "http://localhost:19006/embed"
          : "https://withorbit.com/embed",
      ),
    }),
  ],
  resolve: {
    extensions: [".web.ts", ".ts", ".web.js", ".js"],
    fallback: {crypto: false}
  },
};
