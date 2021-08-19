import alias from "@rollup/plugin-alias";
import json from "@rollup/plugin-json";
import resolve from "@rollup/plugin-node-resolve";
import extensions from "rollup-plugin-extensions";
import path from "path";

export default {
  input: "dist/index.js",
  output: {
    file: "dist/bundle.js",
    format: "esm",
  },
  context: "this",
  moduleContext: "this",
  external: (id) => {
    return (
      !id.startsWith(".") &&
      !/packages\/(.+?)\/dist/.test(id) &&
      !/withorbit/.test(id)
    );
  },
  plugins: [
    alias({
      entries: [
        {
          find: "@withorbit/api",
          replacement: path.resolve(__dirname, "../api/dist"),
        },
        {
          find: "@withorbit/core",
          replacement: path.resolve(__dirname, "../core/dist"),
        },
        {
          find: "@withorbit/store-shared",
          replacement: path.resolve(__dirname, "../store-shared/dist"),
        },
      ],
    }),
    json(),
    resolve(),

    extensions(),
  ],
};
