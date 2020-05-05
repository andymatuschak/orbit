const path = require("path");

module.exports = function ({ env }) {
  return {
    babel: {
      presets: ["@babel/preset-env", "@babel/preset-react"],
      plugins: [
        "babel-plugin-transform-class-properties",
        "babel-plugin-react-native-web",
      ],
    },
    webpack: {
      alias: {
        // metabook-ui should use the local react, not its own.
        react: path.resolve("./node_modules/react"),
        "react-dom": path.resolve("./node_modules/react-dom"),
      },
    },
  };
};
