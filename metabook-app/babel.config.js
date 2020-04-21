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
              },
              throwForNonStringLiteral: true,
            },
          ],
        ],
  };
};
