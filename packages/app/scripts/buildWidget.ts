import Bun, { BunPlugin } from "bun";
import * as path from "node:path";

const appRoot = path.join(__dirname, "..");
const srcRoot = path.join(appRoot, "src");
const distRoot = path.join(appRoot, "dist");

// We expose a native SQLite database engine with an API that matches better-sqlite3.
const sqliteShimPlugin: BunPlugin = {
  name: "SQLite shim",
  setup(build) {
    build.onLoad({ filter: /better-sqlite3/ }, () => {
      return {
        contents: "const db = globalThis.SQLiteDatabase; export default db;",
        loader: "js",
      };
    });

    build.onLoad({ filter: /packages\/core\/dist\/util\/crypto\.js/ }, () => {
      return {
        contents: "export const crypto = globalThis.cryptoShim;",
        loader: "js",
      };
    });
  },
};

(async () => {
  await Bun.build({
    entrypoints: [path.join(srcRoot, "widget.ts")],
    outdir: distRoot,
    plugins: [sqliteShimPlugin],
  });
})();
