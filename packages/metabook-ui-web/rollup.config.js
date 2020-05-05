import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import babel from "rollup-plugin-babel";
import { terser } from "rollup-plugin-terser";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";

const env = process.env.NODE_ENV || "development";

module.exports = {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "esm",
  },
  context: undefined,
  plugins: [
    json(),
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),
    babel({
      include: [
        /react-native-markdown-display/,
        /metabook-ui/,
        /react-native-fit-image/,
      ],
      babelrc: false,
      presets: ["@babel/preset-env", "@babel/preset-react"],
      plugins: ["babel-plugin-transform-class-properties", "react-native-web"],
    }),
    resolve({
      resolveOnly: [
        /react-native-markdown-display/,
        /metabook-ui/,
        /react-native-fit-image/,
      ],
    }),
    // Unfortunately, react-native-markdown-display's distribution files contain JSX and exotic JS.
    typescript(),
    env === "production" && terser(),
  ].filter(i => i),
};
