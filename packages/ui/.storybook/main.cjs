const path = require("path");

module.exports = {
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-knobs"],
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
    config.resolve.alias["react-native$"] = "react-native-web";
    config.resolve.extensions.unshift(".web.js", ".web.jsx", ".web.ts", ".web.tsx");
    return config;
  },
};
