import { expect, test } from "bun:test";
import { AppUpdateController, type AppUpdate } from "./appUpdateController.js";

const release = {
  buildNumber: "12",
  version: "1.0.0",
  bundleIdentifier: "com.withorbit.native",
  manifestURL: "https://laptop.example.ts.net/updates/native/12/manifest.plist",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function fixture() {
  const shown: AppUpdate[] = [];
  const dismissals: (() => void)[] = [];
  const checking: boolean[] = [];
  let dismiss = () => {};
  let current = 0;
  let errors = 0;
  let reloadSafe = true;
  let nativeChecks = 0;
  let javascriptChecks = 0;
  let fetches = 0;
  const dependencies = {
    async checkNative() {
      nativeChecks++;
      return release as typeof release | null;
    },
    async checkJavaScript() {
      javascriptChecks++;
      return null as string | null;
    },
    async fetchJavaScript() {
      fetches++;
    },
    canReload: () => reloadSafe,
    showUpdate(update: AppUpdate, onDismiss: () => void) {
      shown.push(update);
      dismissals.push(onDismiss);
      dismiss = onDismiss;
    },
    showCurrent: () => current++,
    showError: () => errors++,
    setChecking: (value: boolean) => checking.push(value),
  };
  const controller = new AppUpdateController(dependencies);
  return {
    controller,
    dependencies,
    shown,
    dismissals,
    checking,
    dismiss: () => dismiss(),
    setReloadSafe: (value: boolean) => (reloadSafe = value),
    counts: () => ({
      current,
      errors,
      nativeChecks,
      javascriptChecks,
      fetches,
    }),
    async activate() {
      controller.setAppState("active");
      await controller.check();
    },
  };
}

test("an unknown initial app state waits for the first active event", async () => {
  const f = fixture();
  f.controller.setAppState(null);
  f.controller.idle();
  expect(f.counts().nativeChecks).toBe(0);
  expect(f.shown).toEqual([]);
  await f.activate();
  expect(f.counts().nativeChecks).toBe(1);
  expect(f.shown).toEqual([{ kind: "native", release }]);
});

test("foreground discovery offers a native update immediately without a review boundary", async () => {
  const f = fixture();
  await f.activate();
  expect(f.shown).toEqual([{ kind: "native", release }]);
  f.controller.idle();
  expect(f.shown).toHaveLength(1);
});

test("an update discovered after the question appears is still offered immediately", async () => {
  const f = fixture();
  const native = deferred<typeof release>();
  f.dependencies.checkNative = () => native.promise;
  f.controller.setAppState("active");
  const check = f.controller.check();
  f.controller.idle();
  native.resolve(release);
  await check;
  expect(f.shown).toHaveLength(1);
});

test("a pending write defers automatic prompts until it finishes", async () => {
  const f = fixture();
  f.setReloadSafe(false);
  await f.activate();
  expect(f.shown).toEqual([]);
  f.setReloadSafe(true);
  f.controller.idle();
  expect(f.shown).toHaveLength(1);
});

test("pending writes and background state block automatic prompts", async () => {
  const f = fixture();
  f.setReloadSafe(false);
  await f.activate();
  f.controller.idle();
  expect(f.shown).toEqual([]);
  f.setReloadSafe(true);
  f.controller.setAppState("background");
  f.controller.idle();
  expect(f.shown).toEqual([]);
  f.controller.setAppState("active");
  await f.controller.check();
  expect(f.shown).toHaveLength(1);
});

test("checks both kinds in parallel but prefers native without fetching JS", async () => {
  const f = fixture();
  const native = deferred<typeof release>();
  let javascriptChecked = false;
  f.dependencies.checkNative = () => native.promise;
  f.dependencies.checkJavaScript = async () => {
    javascriptChecked = true;
    return "checkpoint-1";
  };
  f.controller.setAppState("active");
  const check = f.controller.check();
  await Promise.resolve();
  expect(javascriptChecked).toBe(true);
  native.resolve(release);
  await check;
  expect(f.counts().fetches).toBe(0);
  expect(f.shown).toEqual([{ kind: "native", release }]);
});

test("native check failure does not hide a downloaded JavaScript update", async () => {
  const f = fixture();
  f.dependencies.checkNative = async () => {
    throw new Error("Laptop unavailable");
  };
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  await f.activate();
  expect(f.counts().fetches).toBe(1);
  expect(f.shown).toEqual([{ kind: "javascript", id: "checkpoint-1" }]);
  expect(f.counts().errors).toBe(0);
});

test("JavaScript check failure does not hide a native update", async () => {
  const f = fixture();
  f.dependencies.checkJavaScript = async () => {
    throw new Error("Offline");
  };
  await f.activate();
  f.controller.idle();
  expect(f.shown).toEqual([{ kind: "native", release }]);
});

test("a JavaScript update is offered only after its download completes", async () => {
  const f = fixture();
  const download = deferred<void>();
  f.dependencies.checkNative = async () => null;
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  f.dependencies.fetchJavaScript = () => download.promise;
  f.controller.setAppState("active");
  const check = f.controller.check();
  f.controller.idle();
  expect(f.shown).toEqual([]);
  download.resolve();
  await check;
  expect(f.shown).toEqual([{ kind: "javascript", id: "checkpoint-1" }]);
});

test("automatic errors and no-update results stay quiet; manual checks explain", async () => {
  const f = fixture();
  f.dependencies.checkNative = async () => null;
  await f.activate();
  expect(f.counts()).toMatchObject({ current: 0, errors: 0 });
  await f.controller.check(true);
  expect(f.counts().current).toBe(1);
  f.dependencies.checkJavaScript = async () => {
    throw new Error("Offline");
  };
  await f.controller.check();
  expect(f.counts().errors).toBe(0);
  await f.controller.check(true);
  expect(f.counts().errors).toBe(1);
});

test("failed JavaScript downloads do not become ready updates", async () => {
  const f = fixture();
  f.dependencies.checkNative = async () => null;
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  f.dependencies.fetchJavaScript = async () => {
    throw new Error("Offline");
  };
  await f.activate();
  f.controller.idle();
  expect(f.shown).toEqual([]);
  await f.controller.check(true);
  expect(f.counts().errors).toBe(1);
});

test("Later suppresses automatic repetition but a manual check can reoffer", async () => {
  const f = fixture();
  await f.activate();
  f.controller.idle();
  f.dismiss();
  f.controller.idle();
  await f.controller.check();
  f.controller.idle();
  expect(f.shown).toHaveLength(1);
  await f.controller.check(true);
  expect(f.shown).toHaveLength(2);
});

test("a different release is offered immediately when discovered", async () => {
  const f = fixture();
  await f.activate();
  f.controller.idle();
  f.dismiss();
  f.dependencies.checkNative = async () => ({ ...release, buildNumber: "13" });
  await f.controller.check();
  expect(f.shown).toHaveLength(2);
});

test("initial activation and real foregrounding check, alert inactivity does not", async () => {
  const f = fixture();
  await f.activate();
  f.controller.setAppState("inactive");
  f.controller.setAppState("active");
  expect(f.counts().nativeChecks).toBe(1);
  f.controller.setAppState("background");
  f.controller.setAppState("inactive");
  f.controller.setAppState("active");
  await f.controller.check();
  expect(f.counts().nativeChecks).toBe(2);
});

test("launching inactive still checks on the first activation", async () => {
  const f = fixture();
  f.controller.setAppState("inactive");
  await f.activate();
  expect(f.counts().nativeChecks).toBe(1);
  expect(f.counts().javascriptChecks).toBe(1);
});

test("concurrent manual check joins automatic discovery and still gets a result", async () => {
  const f = fixture();
  const native = deferred<typeof release | null>();
  f.dependencies.checkNative = () => native.promise;
  f.controller.setAppState("active");
  const automatic = f.controller.check();
  const manual = f.controller.check(true);
  expect(manual).toBe(automatic);
  native.resolve(null);
  await manual;
  expect(f.counts().current).toBe(1);
  expect(f.counts().javascriptChecks).toBe(1);
  expect(f.checking).toEqual([true, false]);
});

test("manual update requests defer while saving and can then show mid-session", async () => {
  const f = fixture();
  f.setReloadSafe(false);
  await f.activate();
  await f.controller.check(true);
  expect(f.shown).toEqual([]);
  f.setReloadSafe(true);
  f.controller.idle();
  expect(f.shown).toHaveLength(1);
});

test("manual results discovered while inactive wait until the app is active", async () => {
  const f = fixture();
  const native = deferred<typeof release>();
  f.dependencies.checkNative = () => native.promise;
  f.controller.setAppState("active");
  const check = f.controller.check(true);
  f.controller.setAppState("inactive");
  native.resolve(release);
  await check;
  expect(f.shown).toEqual([]);
  f.controller.setAppState("active");
  expect(f.shown).toHaveLength(1);
});

test("visible update prompts do not overlap", async () => {
  const f = fixture();
  await f.activate();
  f.controller.idle();
  await f.controller.check(true);
  f.controller.idle();
  expect(f.shown).toHaveLength(1);
  f.dismiss();
  expect(f.shown).toHaveLength(2);
});

test("a repeated dismissal from an old alert cannot dismiss its successor", async () => {
  const f = fixture();
  await f.activate();
  const dismissFirst = f.dismissals[0];
  await f.controller.check(true);
  dismissFirst();
  expect(f.shown).toHaveLength(2);
  dismissFirst();
  await f.controller.check(true);
  expect(f.shown).toHaveLength(2);
  f.dismiss();
  expect(f.shown).toHaveLength(3);
});

test("a previously downloaded update survives an empty later check", async () => {
  const f = fixture();
  f.dependencies.checkNative = async () => null;
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  await f.activate();
  f.dependencies.checkJavaScript = async () => null;
  await f.controller.check(true);
  expect(f.shown).toEqual([{ kind: "javascript", id: "checkpoint-1" }]);
  expect(f.counts().fetches).toBe(1);
});

test("withdrawing a native release lets the manual check report current", async () => {
  const f = fixture();
  await f.activate();
  f.dismiss();
  f.dependencies.checkNative = async () => null;
  await f.controller.check(true);
  expect(f.shown).toEqual([{ kind: "native", release }]);
  expect(f.counts().current).toBe(1);
});

test("withdrawing a native release lets a JavaScript update be downloaded", async () => {
  const f = fixture();
  await f.activate();
  f.dismiss();
  f.dependencies.checkNative = async () => null;
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  await f.controller.check(true);
  expect(f.shown).toEqual([
    { kind: "native", release },
    { kind: "javascript", id: "checkpoint-1" },
  ]);
  expect(f.counts().fetches).toBe(1);
});

test("rediscovering downloaded JavaScript does not download it again", async () => {
  const f = fixture();
  f.dependencies.checkNative = async () => null;
  f.dependencies.checkJavaScript = async () => "checkpoint-1";
  await f.activate();
  await f.controller.check();
  expect(f.counts().fetches).toBe(1);
});

test("closing drops pending discoveries and all later lifecycle work", async () => {
  const f = fixture();
  const native = deferred<typeof release>();
  f.dependencies.checkNative = () => native.promise;
  f.controller.setAppState("active");
  const check = f.controller.check(true);
  f.controller.close();
  native.resolve(release);
  await check;
  f.controller.setAppState("background");
  f.controller.setAppState("active");
  f.controller.idle();
  f.controller.idle();
  await f.controller.check(true);
  expect(f.shown).toEqual([]);
  expect(f.counts()).toMatchObject({
    current: 0,
    errors: 0,
    javascriptChecks: 1,
  });
  expect(f.checking).toEqual([true]);
});
