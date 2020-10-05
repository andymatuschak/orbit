const nodeExternals = require("webpack-node-externals");
const path = require("path");

const babelOptions = {
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

const libraryBabelOptions = {
  ...babelOptions, // Very annoying conflict: TypeScript allows (and culturally prefers) importing local modules without specifying an extension, but ESM and Node 12 modules require an extension. There's a longstanding request to have TypeScript emit import statements with extensions when transpiling, but they've not done it. So we use a hack: this plugin munges the imports.
  plugins: ["babel-plugin-add-import-extension"],
};

module.exports = {
  entry: "./src",
  target: "node",
  mode: "development",
  externals: [
    nodeExternals({
      additionalModuleDirs: [path.resolve(__dirname, "../../node_modules")],
      allowlist: ["metabook-core", "metabook-firebase-support"],
    }),
  ],
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "main.cjs",
    libraryTarget: "commonjs",
  },
  module: {
    rules: [
      {
        test: /\.ts(x?)$/,
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
            options: libraryBabelOptions,
          },
        ],
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: {
      "metabook-core": path.resolve(__dirname, "../metabook-core"),
      "multiformats": path.resolve(__dirname, "../../node_modules/multiformats/esm/index.js"),
    },
  },
};
