module.exports = function ({ env }) {
  return {
    babel: {
      presets: ["@babel/preset-env", "@babel/preset-react"],
      plugins: [
        "babel-plugin-transform-class-properties",
        "babel-plugin-react-native-web",
      ],
    },
  };
};
