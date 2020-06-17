module.exports = function (api) {
  const isTest = api.env("test");
  api.caller((caller) => console.log(caller));
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
          "module:metro-react-native-babel-preset",
        ]
      : ["babel-preset-expo"],
    plugins: isTest
      ? []
      : [
          [
            require("babel-plugin-rewrite-require"),
            {
              aliases: {
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
