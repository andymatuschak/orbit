const { describe, expect, test } = require("bun:test");
const { updateAppDelegate } = require("./withSceneLifecycle");

const generatedAppDelegate = `@main
class AppDelegate: ExpoAppDelegate {
  var window: UIWindow?

  func start() {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
  }
}`;

describe("withSceneLifecycle", () => {
  test("moves React Native startup out of the app delegate", () => {
    const result = updateAppDelegate(generatedAppDelegate);

    expect(result).toContain(
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {",
    );
    expect(result).toContain(
      "    // SceneDelegate creates the window and starts React Native.",
    );
    expect(result).not.toContain("factory.startReactNative(");
  });

  test("is idempotent", () => {
    const once = updateAppDelegate(generatedAppDelegate);
    expect(updateAppDelegate(once)).toBe(once);
  });

  test("fails rather than silently accepting a changed Expo template", () => {
    expect(() =>
      updateAppDelegate(
        generatedAppDelegate.replace(
          "withModuleName: \"main\"",
          "withModuleName: moduleName",
        ),
      ),
    ).toThrow("Could not safely remove Expo's legacy React Native startup");
  });
});
