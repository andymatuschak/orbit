import { bundle, makeBundleConfig } from "./bundleShared.js";

const bundleConfig = makeBundleConfig({ isDevelopment: false });
await bundle(bundleConfig);
