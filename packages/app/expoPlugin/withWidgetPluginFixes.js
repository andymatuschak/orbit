const { withMod, withXcodeProject } = require("expo/config-plugins");
const { PBXBuildFile, PBXShellScriptBuildPhase } = require("@bacons/xcode");
const path = require("path");
const { addSourceFile } = require("./util");
module.exports = function withWidgetPluginFixes(config) {
  config = withXcodeProject(config, async (config) => {
    for (const file of [
      "ORWidgetReloadBridge.m",
      "ORWidgetReloadBridge.swift",
    ]) {
      addSourceFile(config, file);
    }
    return config;
  });

  config = withMod(config, {
    platform: "ios",
    // Bit of a hack: we're hooking into @bacons/apple-target's mod here. This string must match the one in https://github.com/EvanBacon/expo-apple-targets/blob/afd63577f43aa50665f2c31ed4ed14c052bc57bd/packages/apple-targets/src/withXcparse.ts.
    mod: "xcodeProjectBeta2",
    action: (config) => {
      const xcodeProject = config.modResults;
      const widgetTarget = xcodeProject.rootObject.props.targets.find(
        (t) => t.props.name === "OrbitWidget",
      );
      const resourcesPhase = widgetTarget.props.buildPhases.find(
        (p) => p.props.isa === "PBXResourcesBuildPhase",
      );
      const mainGroup = xcodeProject.rootObject.props.mainGroup;

      // Add font files to the widget target's resource-copying build phase.
      const mainTargetResourcesGroup = mainGroup
        .getChildGroups()
        .find((g) => g.props.name === "Resources");
      const fontResources = mainTargetResourcesGroup.props.children.filter(
        (ref) => ref.props.name.endsWith(".otf"),
      );
      for (const fileRef of fontResources) {
        if (!resourcesPhase.includesFile(fileRef)) {
          resourcesPhase.props.files.push(
            PBXBuildFile.create(xcodeProject, { fileRef }),
          );
        }
      }

      // Add the built widget JS file to the project, and to the widget target's resource-copying build phase.
      const expoTargetsGroup = mainGroup
        .getChildGroups()
        .find((g) => g.props.name === "expo:targets");
      const widgetGroup = expoTargetsGroup
        .getChildGroups()
        .find((g) => g.props.name === "widgets");
      const widgetBundlePath = path.join(
        config.modRequest.projectRoot,
        "dist/widget.js",
      );
      if (
        !resourcesPhase
          .getFileReferences()
          .some((ref) => ref.getRealPath() === widgetBundlePath)
      ) {
        const widgetBundleFileReference = widgetGroup.createFile({
          path: path.relative(
            path.join(config.modRequest.projectRoot, "targets/widgets"),
            widgetBundlePath,
          ),
        });
        resourcesPhase.props.files.push(
          PBXBuildFile.create(xcodeProject, {
            fileRef: widgetBundleFileReference,
          }),
        );
      }

      // Add a build phase which bundles the JS for the widget.
      if (
        !widgetTarget.props.buildPhases.find(
          (p) => p.props.name === "Bundle widget JS",
        )
      ) {
        const widgetBundlePhase = xcodeProject.createModel({
          isa: PBXShellScriptBuildPhase.isa,
          name: "Bundle widget JS",
          shellScript: `
cd "$PROJECT_DIR"/..
"$HOME"/.bun/bin/bun scripts/buildWidget.ts
`,
        });
        const resourcesPhaseIndex =
          widgetTarget.props.buildPhases.indexOf(resourcesPhase);
        if (resourcesPhaseIndex === -1) {
          throw new Error(
            "Unexpected: couldn't find the resources phase in the widget target.",
          );
        }
        widgetTarget.props.buildPhases.splice(
          resourcesPhaseIndex,
          0,
          widgetBundlePhase,
        );
      }

      return config;
    },
  });

  return config;
};
