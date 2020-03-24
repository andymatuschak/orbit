module.exports = function(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
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
