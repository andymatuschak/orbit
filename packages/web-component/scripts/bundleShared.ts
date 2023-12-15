import { BuildConfig } from "bun";
import path from "node:path";

export const moduleRoot = path.join(import.meta.dir, "..");

export function makeBundleConfig({
  isDevelopment,
}: {
  isDevelopment: boolean;
}) {
  const useLocalServer = process.env["USE_LOCAL_SERVER"];
  return {
    entrypoints: [path.join(moduleRoot, "src/index.ts")],
    sourcemap: "external",
    minify: !isDevelopment,
    outdir: path.join(moduleRoot, "build"),
    naming: `[dir]/orbit-web-component${isDevelopment ? "-dev" : ""}.js`,
    target: "browser",
    define: {
      EMBED_API_BASE_URL: JSON.stringify(
        useLocalServer ?? isDevelopment
          ? "http://localhost:19006/embed"
          : "https://withorbit.com/embed",
      ),
    },
  } satisfies BuildConfig;
}

export async function bundle(config: BuildConfig) {
  const result = await Bun.build(config);
  if (!result.success) {
    console.error("Build failed");
    for (const message of result.logs) {
      console.error(message);
    }
  }
}
