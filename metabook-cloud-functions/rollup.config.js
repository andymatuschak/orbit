import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import babel from "rollup-plugin-babel";
import typescript from "rollup-plugin-typescript2";
import replace from "@rollup/plugin-replace";
import builtins from "rollup-plugin-node-builtins";

import commonjs from "@rollup/plugin-commonjs";

const env = process.env.NODE_ENV || "production";

module.exports = {
  input: "src/index.ts",
  output: {
    file: "dist/index.js",
    format: "cjs",
  },
  context: undefined,
  external: ["worker_threads", "protobufjs"],
  plugins: [
    json(),
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),
    // babel({
    //   include: ["metabook-core"],
    //   babelrc: false,
    //   presets: ["@babel/preset-env"],
    // }),
    // builtins(),
    resolve({
      include: /node_modules/,
      preferBuiltins: true,
      exclude: [/\/core-js\//],
    }),
    commonjs({
      include: [/node_modules/, /metabook-core/],
      exclude: [/\/core-js\//],
      namedExports: {
        "../metabook-core/dist/identifiers/generated/proto.js": ["default"],
        "firebase-admin": ["initializeApp"],
      },
    }),
    // Unfortunately, react-native-markdown-display's distribution files contain JSX and exotic JS.
    typescript(),
  ],
};
