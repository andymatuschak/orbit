const path = require("path");
const webpack = require("webpack");

module.exports = {
  core: {
    builder: "webpack5",
  },
  typescript: {
    reactDocgen: "none",
  },
  stories: ["../src/**/*.stories.tsx"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-knobs"],
  webpackFinal: async (config) => {
    // https://github.com/storybookjs/storybook/issues/15335
    config.module.rules.push({
      // test: /.storybook\/preview.js/,
      resolve: { fullySpecified: false },
    });

    // Annoyingly, our Markdown library has JSX (and other fancy features) in its built distribution JS files.
    config.module.rules.push({
      test: /\.js$/,
      include: /(react-native-markdown-display)|(react-native-mathjax-svg)/,
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
    config.resolve.extensions.unshift(
      ".web.js",
      ".web.jsx",
      ".web.ts",
      ".web.tsx",
    );
    config.resolve.extensionAlias ||= {};
    config.resolve.extensionAlias[".js"] = [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js"];
    config.resolve.extensionAlias[".jsx"] = config.resolve.extensionAlias[".js"];
    return config;
  },
};
