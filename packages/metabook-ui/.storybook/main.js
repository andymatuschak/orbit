const path = require("path");

module.exports = {
  stories: ["../src/**/*.stories.tsx"],
  addons: [
    "@storybook/addon-actions/register",
    "@storybook/addon-links",
    "@storybook/addon-knobs/register",
  ],
  webpackFinal: async (config) => {
    // Annoyingly, our Markdown library has JSX (and other fancy features) in its built distribution JS files.
    config.module.rules.push({
      test: /\.js$/,
      include: /react-native-markdown-display/,
      use: {
        loader: require.resolve("babel-loader"),
        options: {
          plugins: ["babel-plugin-transform-class-properties"],
          presets: [
            [
              "@babel/preset-env",
              { debug: true, targets: { browsers: ["last 2 versions"] } },
            ],
            "@babel/preset-react",
          ],
        },
      },
    });
    config.module.rules.push({
      test: /\.(ts|tsx)$/,
      include: path.resolve(__dirname, "../src"),
      use: [
        {
          loader: require.resolve("ts-loader"),
          options: {
            configFile: path.resolve(__dirname, "./tsconfig.json"),
          },
        },
        { loader: require.resolve("react-docgen-typescript-loader") },
      ],
    });
    config.resolve.alias["react-native$"] = "react-native-web";
    config.resolve.extensions.unshift(".web.js", ".ts", ".tsx");
    return config;
  },
};
