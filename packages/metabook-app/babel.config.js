function isBuildingForWeb(caller) {
  return caller && caller.platform && caller.platform === "web";
}

module.exports = function (api) {
  const isTest = api.env("test");
  const isWeb =
    api.caller(isBuildingForWeb) || process.env["ORBIT_PLATFORM"] === "web";
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
                aliases: {
                  crypto: "crypto-browserify",
                },
                throwForNonStringLiteral: true,
              },
            ],
          ],
    };
  }
};
