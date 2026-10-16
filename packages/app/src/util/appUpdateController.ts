import type { NativeAppRelease } from "./nativeAppUpdate.js";

export type AppUpdate =
  | { kind: "native"; release: NativeAppRelease }
  | { kind: "javascript"; id: string };

interface AppUpdateDependencies {
  checkNative(): Promise<NativeAppRelease | null>;
  checkJavaScript(): Promise<string | null>;
  fetchJavaScript(): Promise<void>;
  canReload(): boolean;
  showUpdate(update: AppUpdate, onDismiss: () => void): void;
  showCurrent(): void;
  showError(): void;
  setChecking(value: boolean): void;
}

/** Foreground discovery offers updates immediately, except during a write. */
export class AppUpdateController {
  private state: string | null = null;
  private hasBeenActive = false;
  private backgrounded = false;
  private closed = false;
  private inFlight?: Promise<void>;
  private manualRequested = false;
  private manualResult: "update" | "current" | "error" | null = null;
  private ready?: AppUpdate;
  private promptVisible = false;
  private offered = new Set<string>();

  constructor(private readonly dependencies: AppUpdateDependencies) {}

  check(manual = false): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.manualRequested ||= manual;
    if (this.inFlight) return this.inFlight;
    this.dependencies.setChecking(true);
    this.inFlight = this.discover().finally(() => {
      this.inFlight = undefined;
      if (!this.closed) this.dependencies.setChecking(false);
    });
    return this.inFlight;
  }

  setAppState(state: string | null): void {
    if (this.closed) return;
    const check =
      state === "active" && (!this.hasBeenActive || this.backgrounded);
    this.state = state;
    if (state === "background") this.backgrounded = true;
    if (state === "active") {
      this.hasBeenActive = true;
      this.backgrounded = false;
      this.idle();
      if (check) void this.check();
    }
  }

  idle(): void {
    this.offer();
  }

  close(): void {
    this.closed = true;
    this.ready = undefined;
    this.manualResult = null;
  }

  private async discover(): Promise<void> {
    const [native, javascript] = await Promise.allSettled([
      Promise.resolve().then(() => this.dependencies.checkNative()),
      Promise.resolve().then(() => this.dependencies.checkJavaScript()),
    ]);
    if (this.closed) return;
    let failed =
      native.status === "rejected" || javascript.status === "rejected";
    if (
      native.status === "fulfilled" &&
      !native.value &&
      this.ready?.kind === "native"
    )
      this.ready = undefined;
    if (native.status === "fulfilled" && native.value) {
      this.ready = { kind: "native", release: native.value };
    } else if (
      this.ready?.kind !== "native" &&
      javascript.status === "fulfilled" &&
      javascript.value
    ) {
      try {
        if (this.ready?.id !== javascript.value)
          await this.dependencies.fetchJavaScript();
        if (this.closed) return;
        this.ready = { kind: "javascript", id: javascript.value };
      } catch {
        failed = true;
      }
    }
    if (this.manualRequested) {
      this.manualRequested = false;
      this.manualResult = this.ready ? "update" : failed ? "error" : "current";
    }
    this.idle();
  }

  private offer(): void {
    if (
      this.closed ||
      this.state !== "active" ||
      this.promptVisible ||
      !this.dependencies.canReload()
    )
      return;

    if (this.ready) {
      const key =
        this.ready.kind === "native"
          ? `native:${this.ready.release.buildNumber}`
          : `javascript:${this.ready.id}`;
      if (!this.manualResult && this.offered.has(key)) return;
      this.offered.add(key);
      this.manualResult = null;
      this.promptVisible = true;
      let dismissed = false;
      this.dependencies.showUpdate(this.ready, () => {
        if (this.closed || dismissed) return;
        dismissed = true;
        this.promptVisible = false;
        this.idle();
      });
    } else if (this.manualResult) {
      const result = this.manualResult;
      this.manualResult = null;
      if (result === "error") this.dependencies.showError();
      else this.dependencies.showCurrent();
    }
  }
}
