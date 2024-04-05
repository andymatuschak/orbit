module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "@babel/plugin-syntax-import-attributes",
        // TODO remove when we move to Node 22 and update import assert to import with
        { deprecatedAssertSyntax: true },
      ],
    ],
  };
};
