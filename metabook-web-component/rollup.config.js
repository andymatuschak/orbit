import alias from "@rollup/plugin-alias";
import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "rollup-plugin-typescript2";
import { terser } from "rollup-plugin-terser";
import replace from "@rollup/plugin-replace";
import json from "@rollup/plugin-json";
import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import path from "path";
import React from "react";
import ReactDOM from "react-dom";
import PropTypes from "prop-types";

const env = process.env.NODE_ENV || "development";

module.exports = {
  input: "src/index.tsx",
  output: {
    file: "dist/index.js",
    format: "esm",
  },
  plugins: [
    replace({
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),
    json(),
    alias({
      entries: [
        {
          find: "react-native-web",
          replacement: path.resolve(
            __dirname,
            "../vendor/react-native-web/packages/react-native-web",
          ),
          // customResolver: resolve(),
        },
      ],
    }),
    resolve({
      customResolveOptions: {
        moduleDirectory: [
          path.resolve(__dirname, "../vendor"),
          path.resolve(__dirname, "node_modules"),
          path.resolve(__dirname, "../node_modules"),
          path.resolve(__dirname, "../metabook-ui-web/node_modules"),
        ],
      },
      preferBuiltins: false,
    }),
    commonjs({
      include: [/node_modules/],
      namedExports: {
        react: Object.keys(React),
        "prop-types": Object.keys(PropTypes),
        "react-dom": Object.keys(ReactDOM),
        "react-dom/unstable-native-dependencies.js": [
          "injectEventPluginsByName",
        ],
        "react-native": ["default"],
        "node_modules/fbjs/lib/ExecutionEnvironment.js": ["canUseDOM"],
      },
    }),
    typescript(),
    env === "production" && terser(),
    env === "development" && serve(),
    env === "development" && livereload("dist"),
  ].filter(i => i),
};
