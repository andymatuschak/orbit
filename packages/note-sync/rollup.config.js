import alias from "@rollup/plugin-alias";
import resolve from "@rollup/plugin-node-resolve";
import commonJS from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import extensions from "rollup-plugin-extensions";
import builtins from "builtin-modules";
// import builtins from "rollup-plugin-node-builtins";
import globals from "rollup-plugin-node-globals";
import path from "path";

export default {
  input: "dist/run.js",
  output: {
    file: "dist/run.cjs",
    format: "cjs",
  },
  context: "this",
  moduleContext: "this",
  external: (id) => {
    console.log(id);
    return (
      !id.startsWith(".") &&
      !/packages\/(.+?)\/dist/.test(id) &&
      id !== "dist/run.js" &&
      !/withorbit/.test(id)
    );
  },
  plugins: [
    alias({
      // These packages require use of the fancy new "exports" package.json field, which it seems @rollup/plugin-node-resolve does not yet support.
      entries: [
        {
          find: /^multiformats$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/multiformats/cjs/src/index.js",
          ),
        },
        {
          find: /^multiformats\/(.+)$/,
          replacement: path.resolve(
            __dirname,
            "../../node_modules/multiformats/cjs/src/$1.js",
          ),
        },
        {
          find: /^@ipld\/dag-json$/,
          replacement: "@ipld/dag-json/cjs/index.js",
        },
      ],
    }),
    commonJS(),
    // globals(),
    // builtins(),
    extensions(),
    resolve({ preferBuiltins: true }),
    json(),
  ],
};
