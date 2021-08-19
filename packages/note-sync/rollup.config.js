import resolve from "@rollup/plugin-node-resolve";
import commonJS from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import extensions from "rollup-plugin-extensions";
// import builtins from "rollup-plugin-node-builtins";

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
    commonJS(),
    // globals(),
    // builtins(),
    extensions(),
    resolve({ preferBuiltins: true }),
    json(),
  ],
};
