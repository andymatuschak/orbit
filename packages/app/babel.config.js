module.exports = function (api) {
  const isStorybook = api.env("storybook");

  if (isStorybook) {
    return {
      sourceType: "unambiguous",
      presets: [
        [
          "@babel/preset-env",
          {
            targets: {
              chrome: 100,
              safari: 15,
              firefox: 91,
            },
          },
        ],
        "@babel/preset-typescript",
        "@babel/preset-react",
      ],
      plugins: [],
    };
  }

  return {
    presets: ["babel-preset-expo"],
  };
};
