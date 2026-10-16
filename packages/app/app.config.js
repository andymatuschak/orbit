// One private installation. Neither debug builds nor updates select public Orbit.
module.exports = ({ config }) => {
  const buildNumber =
    process.env.ORBIT_LAB_BUILD_NUMBER || config.ios.buildNumber;
  if (
    !/^[1-9][0-9]{0,17}$/.test(buildNumber) ||
    !Number.isSafeInteger(Number(buildNumber))
  ) {
    throw new Error("ORBIT_LAB_BUILD_NUMBER must be a positive integer");
  }
  const origin = new URL(
    process.env.EXPO_PUBLIC_ORBIT_LAB_ORIGIN ||
      "https://slab.tail0da701.ts.net",
  );
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    origin.hostname,
  );
  if (
    !(origin.protocol === "https:" && origin.hostname.endsWith(".ts.net")) &&
    !(loopback && origin.protocol === "http:")
  ) {
    throw new Error(
      "Lab code updates require private Tailscale HTTPS or loopback HTTP",
    );
  }
  if (
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash ||
    origin.username ||
    origin.password
  ) {
    throw new Error(
      "EXPO_PUBLIC_ORBIT_LAB_ORIGIN must be an origin, not a credential or path",
    );
  }
  return {
    ...config,
    extra: { labOrigin: origin.origin },
    // Bump this whenever Swift, native dependencies, or entitlements change.
    // Ordinary JavaScript checkpoints target the installed native runtime.
    runtimeVersion:
      process.env.EXPO_UPDATES_RUNTIME_VERSION || "orbit-lab-native-5",
    updates: {
      url: `${origin.origin}/updates/manifest`,
      checkAutomatically: "ON_LOAD",
      fallbackToCacheTimeout: 0,
      useEmbeddedUpdate: true,
    },
    ios: {
      ...config.ios,
      buildNumber,
      infoPlist: { ...config.ios.infoPlist, CFBundleDisplayName: "Orbit Lab" },
    },
  };
};
