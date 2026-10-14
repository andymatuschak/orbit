import { expect, test } from "bun:test";
import { checkNativeAppUpdate } from "./nativeAppUpdate.js";

const origin = "https://laptop.example.ts.net";
const installed = {
  bundleIdentifier: "com.withorbit.native",
  buildNumber: "60",
};
const release = {
  buildNumber: "61",
  version: "1.0.0",
  bundleIdentifier: installed.bundleIdentifier,
  manifestURL: `${origin}/updates/native/61/manifest.plist`,
};
const response =
  (value: unknown, status = 200) =>
  async () => ({ ok: status === 200, status, json: async () => value });

test("offers a newer same-app native release independently of its JS runtime", async () => {
  let requestedURL: string | undefined;
  let requestedOptions: RequestInit | undefined;
  expect(
    await checkNativeAppUpdate(origin, installed, async (url, options) => {
      requestedURL = url;
      requestedOptions = options;
      return response(release)();
    }),
  ).toEqual(release);
  expect(requestedURL).toBe(`${origin}/updates/native.json`);
  expect(requestedOptions?.redirect).toBe("error");
  expect(requestedOptions?.cache).toBe("no-store");
  expect(requestedOptions?.signal).toBeInstanceOf(AbortSignal);
});

test("missing, same and older native releases leave JS updates available", async () => {
  expect(
    await checkNativeAppUpdate(origin, installed, response(null, 404)),
  ).toBeNull();
  for (const buildNumber of ["60", "59"]) {
    expect(
      await checkNativeAppUpdate(
        origin,
        installed,
        response({
          ...release,
          buildNumber,
          manifestURL: `${origin}/updates/native/${buildNumber}/manifest.plist`,
        }),
      ),
    ).toBeNull();
  }
});

test("rejects malformed releases and releases for another native app", async () => {
  for (const value of [
    null,
    [],
    {},
    { ...release, buildNumber: 61 },
    { ...release, buildNumber: "0" },
    { ...release, buildNumber: "61.0" },
    { ...release, buildNumber: "9007199254740992" },
    { ...release, version: " " },
    { ...release, bundleIdentifier: "com.somebody.else" },
  ]) {
    await expect(
      checkNativeAppUpdate(origin, installed, response(value)),
    ).rejects.toThrow("release is invalid");
  }
});

test("rejects cross-origin, credentialed or noncanonical installation manifests", async () => {
  for (const manifestURL of [
    "https://public.example.com/updates/native/61/manifest.plist",
    "https://other.example.ts.net/updates/native/61/manifest.plist",
    "https://secret@laptop.example.ts.net/updates/native/61/manifest.plist",
    `${origin}/updates/native/61/manifest.plist?token=secret`,
    `${origin}/updates/native/61/manifest.plist#fragment`,
    `${origin}/updates/native/60/manifest.plist`,
    "/updates/native/61/manifest.plist",
    `${origin}/updates/native/61/../61/manifest.plist`,
  ]) {
    await expect(
      checkNativeAppUpdate(
        origin,
        installed,
        response({
          ...release,
          manifestURL,
        }),
      ),
    ).rejects.toThrow("release is invalid");
  }
});

test("does not fetch release descriptors from public or credentialed origins", async () => {
  for (const serviceOrigin of [
    "https://public.example.com",
    "https://secret@laptop.example.ts.net",
    `${origin}/path`,
    `${origin}?token=secret`,
    "http://laptop.example.ts.net",
  ]) {
    await expect(
      checkNativeAppUpdate(serviceOrigin, installed, async () => {
        throw new Error("Must not fetch");
      }),
    ).rejects.toThrow("private Tailscale HTTPS origin");
  }
});

test("loopback development leaves the Simulator JavaScript update workflow intact", async () => {
  for (const serviceOrigin of [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "http://[::1]:8787",
  ]) {
    expect(
      await checkNativeAppUpdate(
        serviceOrigin,
        {
          bundleIdentifier: null,
          buildNumber: null,
        },
        async () => {
          throw new Error("Must not fetch a native release from loopback");
        },
      ),
    ).toBeNull();
  }
  await expect(
    checkNativeAppUpdate("http://secret@localhost:8787", installed),
  ).rejects.toThrow("private Tailscale HTTPS origin");
});

test("reports server and transport failures instead of offering an invalid update", async () => {
  await expect(
    checkNativeAppUpdate(origin, installed, response(null, 503)),
  ).rejects.toThrow("Could not fetch");
  await expect(
    checkNativeAppUpdate(origin, installed, async () => {
      throw new Error("Offline");
    }),
  ).rejects.toThrow("Offline");
  await expect(
    checkNativeAppUpdate(
      origin,
      {
        ...installed,
        buildNumber: null,
      },
      response(release),
    ),
  ).rejects.toThrow("identity is unavailable");
});

test("aborts a release request after five seconds", async () => {
  await expect(
    checkNativeAppUpdate(
      origin,
      installed,
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener("abort", () =>
            reject(new Error("Timed out")),
          );
        }),
    ),
  ).rejects.toThrow("Timed out");
}, 6_000);
