import * as path from "node:path";
import { watch, realpathSync, statSync } from "node:fs";
import { bundle, makeBundleConfig, moduleRoot } from "./bundleShared.js";

const orbitRoot = path.join(moduleRoot, "../..");
const serverRoot = path.join(moduleRoot, "test");
const bundleConfig = makeBundleConfig({ isDevelopment: true });

const watcher = watch(orbitRoot, { recursive: true }, (event, filename) => {
  if (typeof filename === "string") {
    const changedPath = path.resolve(orbitRoot, filename);
    if (!changedPath.startsWith(bundleConfig.outdir)) {
      bundle(bundleConfig);
    }
  }
});

const server = Bun.serve({
  port: 3000,
  fetch(request: Request) {
    const url = new URL(request.url);
    const localFile = path.join(serverRoot, url.pathname);
    if (path.isAbsolute(localFile)) {
      let resolvedPath = realpathSync(localFile);
      if (statSync(resolvedPath).isDirectory()) {
        resolvedPath = path.join(resolvedPath, "index.html");
      }
      return new Response(Bun.file(resolvedPath));
    } else {
      return new Response("Not found", { status: 404 });
    }
  },
});

process.on("SIGINT", () => {
  watcher.close();
  server.stop();
  process.exit(0);
});
