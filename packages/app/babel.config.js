module.exports = function (api) {
  api.cache(true);
  // Needed to remove dead code based on Platform (https://docs.expo.dev/guides/customizing-metro/#tree-shaking-by-platform)
  const disableImportExportTransform = true;
  return {
    presets: [
      [
        "babel-preset-expo",
        {
          native: {
            disableImportExportTransform,
          },
          web: {
            disableImportExportTransform,
          },
        },
      ],
    ],
    plugins: [
      [
        "@babel/plugin-syntax-import-attributes",
        // TODO remove when we move to Node 22 and update import assert to import with
        { deprecatedAssertSyntax: true },
      ],
    ],
  };
};
