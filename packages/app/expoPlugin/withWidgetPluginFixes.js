const path = require("node:path");
const {
  PBXFileReference,
  PBXNativeTarget,
  PBXShellScriptBuildPhase,
} = require("@bacons/xcode");
const {
  withXcodeProjectBeta,
} = require("@bacons/apple-targets/build/with-bacons-xcode");

const WIDGET_TARGET_NAME = "OrbitWidget";
const WIDGET_BUNDLE_PHASE_NAME = "Bundle widget JS";

module.exports = function withWidgetPluginFixes(config) {
  return withXcodeProjectBeta(config, (config) => {
    const project = config.modResults;
    const widgetTarget = project.rootObject.props.targets.find(
      (target) =>
        PBXNativeTarget.is(target) &&
        target.props.productName === WIDGET_TARGET_NAME,
    );
    if (!widgetTarget) {
      throw new Error(`Could not find ${WIDGET_TARGET_NAME} target`);
    }
    widgetTarget.setBuildSetting("SWIFT_VERSION", "6.0");
    widgetTarget.setBuildSetting(
      "SWIFT_ACTIVE_COMPILATION_CONDITIONS",
      "$(inherited) ORBIT_WIDGET_EXTENSION",
    );

    const resourcesPhase = widgetTarget.getResourcesBuildPhase();

    // expo-font creates project references for the app's custom fonts. Reuse
    // those references so the widget can render with the same typefaces.
    const fontReferences = [...project.values()].filter(
      (reference) =>
        PBXFileReference.is(reference) &&
        path.extname(reference.props.path || "").toLowerCase() === ".otf",
    );
    if (fontReferences.length === 0) {
      throw new Error("Could not find Orbit's widget font resources");
    }
    for (const fileRef of fontReferences) {
      resourcesPhase.ensureFile({ fileRef });
    }

    // The widget runs a small JavaScriptCore bundle containing Orbit's
    // scheduling and persistence logic.
    const widgetBundlePath = path.join(
      config.modRequest.projectRoot,
      "dist/widget.js",
    );
    let widgetBundleReference = project.getReferenceForPath(widgetBundlePath);
    if (!widgetBundleReference) {
      const mainGroup = project.rootObject.props.mainGroup;
      const generatedGroup =
        mainGroup
          .getChildGroups()
          .find(
            (group) => group.getDisplayName() === "OrbitWidget Generated",
          ) || mainGroup.createGroup({ name: "OrbitWidget Generated" });
      widgetBundleReference = generatedGroup.createFile({
        path: path.relative(
          path.resolve(project.getProjectRoot()),
          widgetBundlePath,
        ),
        sourceTree: "SOURCE_ROOT",
        lastKnownFileType: "sourcecode.javascript",
      });
    }
    resourcesPhase.ensureFile({ fileRef: widgetBundleReference });

    const phaseProps = {
      name: WIDGET_BUNDLE_PHASE_NAME,
      shellPath: "/bin/sh",
      shellScript: [
        "set -e",
        'cd "$SRCROOT/.."',
        '"${BUN_BINARY:-$HOME/.bun/bin/bun}" scripts/buildWidget.ts',
        "",
      ].join("\n"),
      inputPaths: [],
      outputPaths: ["$(SRCROOT)/../dist/widget.js"],
      alwaysOutOfDate: 1,
      showEnvVarsInLog: 0,
    };
    let bundlePhase = widgetTarget.props.buildPhases.find(
      (phase) =>
        PBXShellScriptBuildPhase.is(phase) &&
        phase.props.name === WIDGET_BUNDLE_PHASE_NAME,
    );
    if (bundlePhase) {
      Object.assign(bundlePhase.props, phaseProps);
    } else {
      bundlePhase = widgetTarget.createBuildPhase(
        PBXShellScriptBuildPhase,
        phaseProps,
      );
    }

    // The bundle must exist before the resources phase copies it.
    const oldPhaseIndex = widgetTarget.props.buildPhases.indexOf(bundlePhase);
    if (oldPhaseIndex >= 0) {
      widgetTarget.props.buildPhases.splice(oldPhaseIndex, 1);
    }
    const resourcesPhaseIndex =
      widgetTarget.props.buildPhases.indexOf(resourcesPhase);
    if (resourcesPhaseIndex < 0) {
      throw new Error(`${WIDGET_TARGET_NAME} has no Resources phase`);
    }
    widgetTarget.props.buildPhases.splice(
      resourcesPhaseIndex,
      0,
      bundlePhase,
    );

    return config;
  });
};
