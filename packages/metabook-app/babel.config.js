module.exports = function (api) {
  const isTest = api.env("test");
  if (!isTest) {
    api.cache(true);
  }
  return {
    presets: isTest
      ? [
          [
            "@babel/preset-env",
            {
              targets: {
                node: "current",
              },
            },
          ],
          "@babel/preset-typescript",
        ]
      : ["babel-preset-expo"],
    plugins: isTest
      ? []
      : [
          [
            require("babel-plugin-rewrite-require"),
            {
              aliases: {
                crypto: "crypto-browserify",
                "firebase/app": "@react-native-firebase/app",
                "firebase/firestore": "@react-native-firebase/firestore",
                "firebase/functions": "@react-native-firebase/functions",
              },
              throwForNonStringLiteral: true,
            },
          ],
        ],
  };
};
