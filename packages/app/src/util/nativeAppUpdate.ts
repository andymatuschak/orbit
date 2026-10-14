export interface NativeAppRelease {
  buildNumber: string;
  version: string;
  bundleIdentifier: string;
  manifestURL: string;
}

type ReleaseFetch = (
  url: string,
  options: RequestInit,
) => Promise<Pick<Response, "ok" | "status" | "json">>;

/** Native releases are separate from runtime-compatible JavaScript checkpoints. */
export async function checkNativeAppUpdate(
  serviceOrigin: string,
  installed: { bundleIdentifier: string | null; buildNumber: string | null },
  fetchRelease: ReleaseFetch = fetch,
): Promise<NativeAppRelease | null> {
  const origin = new URL(serviceOrigin);
  const localDevelopment =
    origin.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    (!(origin.protocol === "https:" && origin.hostname.endsWith(".ts.net")) &&
      !localDevelopment) ||
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    throw new Error(
      "Native updates require the private Tailscale HTTPS origin.",
    );
  }
  // Simulator loopback hosts serve JavaScript checkpoints, not installable IPAs.
  if (localDevelopment) return null;
  if (!installed.bundleIdentifier || !isBuildNumber(installed.buildNumber)) {
    throw new Error("The installed native app identity is unavailable.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetchRelease(
      `${origin.origin}/updates/native.json`,
      {
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    if (response.status === 404) return null;
    if (!response.ok)
      throw new Error("Could not fetch the native app release.");
    const release: unknown = await response.json();
    if (
      !release ||
      typeof release !== "object" ||
      !("buildNumber" in release) ||
      !isBuildNumber(release.buildNumber) ||
      !("version" in release) ||
      typeof release.version !== "string" ||
      !release.version.trim() ||
      !("bundleIdentifier" in release) ||
      release.bundleIdentifier !== installed.bundleIdentifier ||
      !("manifestURL" in release) ||
      release.manifestURL !==
        `${origin.origin}/updates/native/${release.buildNumber}/manifest.plist`
    ) {
      throw new Error("The native app release is invalid.");
    }
    return Number(release.buildNumber) > Number(installed.buildNumber)
      ? (release as NativeAppRelease)
      : null;
  } finally {
    clearTimeout(timeout);
  }
}

function isBuildNumber(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9]\d*$/.test(value) &&
    Number.isSafeInteger(Number(value))
  );
}
