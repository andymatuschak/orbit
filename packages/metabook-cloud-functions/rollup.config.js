import alias from "@rollup/plugin-alias";
import resolve from "@rollup/plugin-node-resolve";
import extensions from "rollup-plugin-extensions";
import path from "path";

export default {
  input: "dist/index.js",
  output: {
    file: "dist/bundle.js",
    format: "cjs",
  },
  context: "this",
  moduleContext: "this",
  external: (id) => {
    return (
      !id.startsWith(".") &&
      !/metabook-core/.test(id) &&
      !/metabook-cloud-functions/.test(id) &&
      !/metabook-firebase-support/.test(id)
    );
  },
  plugins: [
    alias({
      entries: [
        {
          find: "metabook-core",
          replacement: path.resolve(__dirname, "../metabook-core/dist"),
        },
        {
          find: "metabook-firebase-support",
          replacement: path.resolve(
            __dirname,
            "../metabook-firebase-support/dist",
          ),
        },
      ],
    }),
    resolve(),

    extensions(),
  ],
};
