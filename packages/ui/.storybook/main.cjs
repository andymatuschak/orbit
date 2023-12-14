const path = require("path");
const webpack = require("webpack");

const getAbsolutePath = (packageName) =>
  path.dirname(require.resolve(path.join(packageName, "package.json")));

module.exports = {
  typescript: {
    reactDocgen: "none",
  },
  staticDirs: ["../assets"],
  stories: ["../src/**/*.stories.tsx"],
  addons: [
    getAbsolutePath("@storybook/addon-essentials"),
    getAbsolutePath("@storybook/addon-knobs"),
  ],

  webpackFinal: async (config) => {
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
    config.resolve.extensionAlias[".js"] = [
      ".web.tsx",
      ".web.ts",
      ".web.js",
      ".tsx",
      ".ts",
      ".js",
    ];
    config.resolve.extensionAlias[".jsx"] =
      config.resolve.extensionAlias[".js"];
    return config;
  },

  framework: {
    name: getAbsolutePath("@storybook/react-webpack5"),
    options: {},
  },

  previewHead: (head) => `
    ${head}
    <style type="text/css">
  @font-face {
    font-family: "dr-bold";
    src: url("/fonts/drweb-bold.eot");
    src: url("/fonts/drweb-bold.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-bold.woff") format("woff");
  }
  @font-face {
    font-family: "dr-bolditalic";
    src: url("/fonts/drweb-bolditalic.eot");
    src: url("/fonts/drweb-bolditalic.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-bolditalic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-extrabold";
    src: url("/fonts/drweb-extrabold.eot");
    src: url("/fonts/drweb-extrabold.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-extrabold.woff") format("woff");
  }
  @font-face {
    font-family: "dr-extrabolditalic";
    src: url("/fonts/drweb-extrabolditalic.eot");
    src: url("/fonts/drweb-extrabolditalic.eot?#iefix")
        format("embedded-opentype"),
      url("/fonts/drweb-extrabolditalic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-extralight";
    src: url("/fonts/drweb-extralight.eot");
    src: url("/fonts/drweb-extralight.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-extralight.woff") format("woff");
  }
  @font-face {
    font-family: "dr-extralightitalic";
    src: url("/fonts/drweb-extralightitalic.eot");
    src: url("/fonts/drweb-extralightitalic.eot?#iefix")
        format("embedded-opentype"),
      url("/fonts/drweb-extralightitalic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-italic";
    src: url("/fonts/drweb-italic.eot");
    src: url("/fonts/drweb-italic.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-italic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-light";
    src: url("/fonts/drweb-light.eot");
    src: url("/fonts/drweb-light.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-light.woff") format("woff");
  }
  @font-face {
    font-family: "dr-lightitalic";
    src: url("/fonts/drweb-lightitalic.eot");
    src: url("/fonts/drweb-lightitalic.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-lightitalic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-medium";
    src: url("/fonts/drweb-medium.eot");
    src: url("/fonts/drweb-medium.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-medium.woff") format("woff");
  }
  @font-face {
    font-family: "dr-mediumitalic";
    src: url("/fonts/drweb-mediumitalic.eot");
    src: url("/fonts/drweb-mediumitalic.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-mediumitalic.woff") format("woff");
  }
  @font-face {
    font-family: "dr-regular";
    src: url("/fonts/drweb-regular.eot");
    src: url("/fonts/drweb-regular.eot?#iefix") format("embedded-opentype"),
      url("/fonts/drweb-regular.woff") format("woff");
  }
  @font-face {
    font-family: "Raptor Premium Regular";
    src: url("/fonts/RaptorPremium-Regular.woff2") format("woff2"), url("/fonts/RaptorPremium-Regular.woff") format("woff");
  }
</style>
  `
};
