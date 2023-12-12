// babel.config.js
module.exports = {
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
  ],
  plugins: [
    [
      "@babel/plugin-syntax-import-attributes",
      // TODO remove when we move to Node 22 and update import assert to import with
      { deprecatedAssertSyntax: true },
    ],
  ],
};
