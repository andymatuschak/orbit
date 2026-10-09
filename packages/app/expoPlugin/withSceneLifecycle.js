const {
  withAppDelegate,
  withInfoPlist,
  withXcodeProject,
} = require("expo/config-plugins");
const { addSourceFile } = require("./util");

// TODO(upstream): Remove this plugin and ios/SceneDelegate.swift once Orbit's
// versioned Expo prebuild template emits the scene lifecycle itself. A clean
// prebuild must (1) make AppDelegate conform to ExpoReactNativeFactoryProvider,
// (2) add SceneDelegate.swift, and (3) add UIApplicationSceneManifest.
// Expo's runtime support landed before its released template wiring:
// https://github.com/expo/expo/issues/46664
// Upstream template to compare when upgrading Expo:
// https://github.com/expo/expo/blob/main/templates/expo-template-bare-minimum/ios/HelloWorld/AppDelegate.swift
const appDelegateDeclaration =
  "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {";
const legacyStartup = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif`;

function updateAppDelegate(contents) {
  if (!contents.includes(appDelegateDeclaration)) {
    const oldDeclaration = "class AppDelegate: ExpoAppDelegate {";
    if (!contents.includes(oldDeclaration)) {
      throw new Error("Could not find Expo's AppDelegate declaration");
    }
    contents = contents.replace(oldDeclaration, appDelegateDeclaration);
  }

  if (contents.includes(legacyStartup)) {
    contents = contents.replace(
      legacyStartup,
      "    // SceneDelegate creates the window and starts React Native.",
    );
  } else if (contents.includes("factory.startReactNative(")) {
    throw new Error("Could not safely remove Expo's legacy React Native startup");
  }

  return contents;
}

module.exports = function withSceneLifecycle(config) {
  config = withAppDelegate(config, (config) => {
    if (config.modResults.language !== "swift") {
      throw new Error("Orbit's scene lifecycle requires a Swift AppDelegate");
    }
    config.modResults.contents = updateAppDelegate(
      config.modResults.contents,
    );
    return config;
  });

  config = withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return config;
  });

  return withXcodeProject(config, (config) => {
    addSourceFile(config, "SceneDelegate.swift");
    return config;
  });
};

module.exports.updateAppDelegate = updateAppDelegate;
