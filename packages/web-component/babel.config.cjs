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
  plugins:
    process.env["NODE_ENV"] === "test"
      ? []
      : ["babel-plugin-add-import-extension"],
};
