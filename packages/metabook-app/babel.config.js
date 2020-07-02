function isBuildingForWeb(caller) {
  return caller && caller.platform && caller.platform === "web";
}

module.exports = function (api) {
  const isTest = api.env("test");
  const isWeb = api.caller(isBuildingForWeb);
  if (!isTest) {
    api.cache(true);
  }

  if (isTest) {
    return {
      presets: [
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
      ],
      plugins: [],
    };
  } else {
    return {
      presets: ["babel-preset-expo"],
      plugins: isWeb
        ? ["macros"]
        : [
            "macros",
            [
              require("babel-plugin-rewrite-require"),
              {
                // metabook-client should use RNFirebase when running in the react-native context, rather than the JS SDK
                aliases: {
                  "firebase/app": "@react-native-firebase/app",
                  "firebase/firestore": "@react-native-firebase/firestore",
                  "firebase/functions": "@react-native-firebase/functions",
                  crypto: "crypto-browserify",
                },
                throwForNonStringLiteral: true,
              },
            ],
          ],
    };
  }
};
