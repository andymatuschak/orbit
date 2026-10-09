// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");
const fs = require("fs");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Metro selects Automerge's browser/bundler entry point, which imports a Wasm
// module as ESM. Metro does not implement that form of Wasm import. Automerge's
// base64 entry initializes the same runtime synchronously and keeps this
// workaround web-only; native uses the Swift bridge instead.
const automergeBase64Entry = path.resolve(
  path.dirname(require.resolve("@automerge/automerge/slim")),
  "../mjs/entrypoints/fullfat_base64.js",
);

// TYPESCRIPT-COMPATIBLE ESM SPECIFIER RESOLUTION
// ==============================================

// TypeScript 5 does not rewrite import specifiers. So if you have a.ts and b.ts, you import the latter from the former with `import "./b.js"`. We have to teach Metro about these semantics, at least until https://github.com/facebook/metro/issues/886 is resolved. Unfortunately, we also have to teach it about React Native's special platform prefixes. *And* we have to deal with the extra complication that TypeScript compiles ".tsx" files to ".js" (not .jsx!) when its `target` is `react-native`.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "@automerge/automerge") {
    return { filePath: automergeBase64Entry, type: "sourceFile" };
  }

  if (
    platform &&
    (moduleName.startsWith(".") || moduleName.includes("@withorbit")) &&
    /\.jsx?$/.test(moduleName)
  ) {
    const extension = path.extname(moduleName);
    const platformPrefixes = {
      web: [".web", ""],
      ios: [".ios", ".native", ""],
      android: [".android", ".native", ""],
    }[platform];
    if (!platformPrefixes) {
      throw new Error(
        `Couldn't read platform prefixes for ${platform}, ${moduleName}`,
      );
    }
    const alternateExtensions = {
      ".js": [".js", ".jsx", ".ts", ".tsx"],
      ".jsx": [".jsx", ".js", ".tsx", ".ts"],
    }[extension].flatMap((ext) =>
      platformPrefixes.map((prefix) => prefix + ext),
    );
    const resolvedBase = path.resolve(
      context.originModulePath,
      "..",
      moduleName,
    );
    for (const alt of alternateExtensions) {
      const possibleResolvedTsFile = resolvedBase.replace(extension, alt);
      if (fs.existsSync(possibleResolvedTsFile)) {
        return {
          filePath: possibleResolvedTsFile,
          type: "sourceFile",
        };
      }
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
