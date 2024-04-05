// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");

const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// MONOREPO SUPPORT (https://docs.expo.dev/guides/monorepos/)
// ================

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];
// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// 3. Force Metro to resolve (sub)dependencies only from the `nodeModulesPaths`
// config.resolver.disableHierarchicalLookup = true;

// TYPESCRIPT-COMPATIBLE ESM SPECIFIER RESOLUTION
// ==============================================

// TypeScript 5 does not rewrite import specifiers. So if you have a.ts and b.ts, you import the latter from the former with `import "./b.js"`. We have to teach Metro about these semantics, at least until https://github.com/facebook/metro/issues/886 is resolved. Unfortunately, we also have to teach it about React Native's special platform prefixes. *And* we have to deal with the extra complication that TypeScript compiles ".tsx" files to ".js" (not .jsx!) when its `target` is `react-native`.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    (moduleName.startsWith(".") || moduleName.includes("@withorbit")) &&
    /\.jsx?$/.test(moduleName)
  ) {
    const extension = path.extname(moduleName);
    const platformPrefixes = {
      web: [".web", ""],
      ios: [".ios", ".native", ""],
      android: [".android", ".native", ""],
    }[platform];
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
