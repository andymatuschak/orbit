import path from "node:path";

const appOrigin = "http://localhost:19006";
const packageRoot = process.cwd();
const emulatorHubURL = "http://127.0.0.1:4400/emulators";
const authEmulatorURL = "http://127.0.0.1:9099";
const apiBaseURL = "http://127.0.0.1:5001/metabook-system/us-central1/api";
const existingAccount = {
  email: "test@test.com",
  password: "testtest",
  personalAccessToken: "TEST",
} as const;
const smokePassword = "testtest";
const timeoutMillis = 30_000;

type EventList = {
  type: "list";
  hasMore: boolean;
  items: Array<Record<string, unknown>>;
};

type EmbeddedConfiguration = {
  reviewItems: Array<{
    task: {
      id: string;
      spec: Record<string, unknown>;
    };
    componentID: string;
  }>;
};

type RunningWebApp = {
  process: ReturnType<typeof Bun.spawn> | null;
  getOutput: () => string;
};

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function makeID(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString(
    "base64url",
  );
}

function assertCondition(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) throw new Error(message);
}

async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  return await fetch(input, {
    ...init,
    signal: AbortSignal.timeout(10_000),
  });
}

async function waitForURL(url: string, deadlineMillis: number): Promise<void> {
  let lastError: unknown;
  while (Date.now() < deadlineMillis) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(200);
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function assertEmulatorsAreReady(): Promise<void> {
  let response: Response;
  try {
    response = await fetchWithTimeout(emulatorHubURL);
  } catch (error) {
    throw new Error(
      `The Firebase emulators are not ready. Start them with \`bun --cwd packages/backend dev\` before running this smoke test. ${String(error)}`,
    );
  }
  assertCondition(
    response.ok,
    `Firebase Emulator Hub returned ${response.status}`,
  );

  const registry = (await response.json()) as Record<
    string,
    { host?: string; port?: number }
  >;
  const expected = {
    auth: 9099,
    functions: 5001,
    firestore: 8080,
    pubsub: 8085,
    storage: 9199,
  } as const;
  for (const [name, port] of Object.entries(expected)) {
    const service = registry[name];
    assertCondition(
      service?.host === "127.0.0.1" && service.port === port,
      `Expected the ${name} emulator at 127.0.0.1:${port}`,
    );
  }
}

async function drainStream(
  stream: ReadableStream<Uint8Array> | number | undefined,
  append: (text: string) => void,
): Promise<void> {
  if (!stream || typeof stream === "number") return;
  const decoder = new TextDecoder();
  for await (const chunk of stream) append(decoder.decode(chunk));
}

async function startWebApp(): Promise<RunningWebApp> {
  try {
    await waitForURL(`${appOrigin}/embed`, Date.now() + 1_000);
    return { process: null, getOutput: () => "" };
  } catch {
    // Start our own server below.
  }

  let output = "";
  const webProcess = Bun.spawn(["bun", "run", "web"], {
    cwd: packageRoot,
    env: { ...process.env, CI: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const appendOutput = (text: string) => {
    output = (output + text).slice(-20_000);
  };
  void drainStream(webProcess.stdout, appendOutput);
  void drainStream(webProcess.stderr, appendOutput);

  try {
    await waitForURL(`${appOrigin}/embed`, Date.now() + 120_000);
  } catch (error) {
    webProcess.kill();
    throw new Error(`${String(error)}\n\nExpo output:\n${output}`);
  }
  return { process: webProcess, getOutput: () => output };
}

async function stopWebApp(webApp: RunningWebApp): Promise<void> {
  if (!webApp.process) return;
  webApp.process.kill();
  await Promise.race([webApp.process.exited, delay(5_000)]);
}

async function buildWebComponent(): Promise<Blob> {
  const result = await Bun.build({
    entrypoints: [path.join(packageRoot, "../web-component/src/index.ts")],
    target: "browser",
    minify: true,
    define: {
      EMBED_API_BASE_URL: JSON.stringify(`${appOrigin}/embed`),
    },
  });
  if (!result.success) {
    throw new Error(
      `Couldn't build the web component:\n${result.logs.map(String).join("\n")}`,
    );
  }
  const output = result.outputs.find((artifact) =>
    artifact.path.endsWith(".js"),
  );
  assertCondition(output, "The web component build did not produce JavaScript");
  return output;
}

function makeHostHTML(question: string, answer: string): string {
  const escapeAttribute = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta property="og:site_name" content="Orbit web smoke test">
    <meta property="orbit:color" content="red">
    <title>Embedded web smoke test</title>
    <script>
      window.__orbitSmokeMessages = [];
      window.addEventListener("message", (event) => {
        if (event.data && typeof event.data.type === "string") {
          window.__orbitSmokeMessages.push(event.data);
        }
      });
    </script>
    <script type="module" src="/orbit-web-component.js"></script>
    <style>html, body { margin: 0; } orbit-reviewarea { width: 100%; }</style>
  </head>
  <body>
    <orbit-reviewarea>
      <orbit-prompt question="${escapeAttribute(question)}" answer="${escapeAttribute(answer)}"></orbit-prompt>
    </orbit-reviewarea>
  </body>
</html>`;
}

function startHostServer(
  bundle: Blob,
  question: string,
  answer: string,
): ReturnType<typeof Bun.serve> {
  const html = makeHostHTML(question, answer);
  return Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/orbit-web-component.js") {
        return new Response(bundle, {
          headers: { "Content-Type": "text/javascript" },
        });
      }
      if (pathname === "/") {
        return new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
}

async function waitForValue<T>(
  view: Bun.WebView,
  expression: string,
  description: string,
  timeout = timeoutMillis,
): Promise<T> {
  const deadline = Date.now() + timeout;
  let lastValue: unknown;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      lastValue = await view.evaluate(expression);
      if (lastValue) return lastValue as T;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}${lastError ? `; last error: ${String(lastError)}` : ""}`,
  );
}

async function getHostConfiguration(
  view: Bun.WebView,
): Promise<EmbeddedConfiguration> {
  return await waitForValue<EmbeddedConfiguration>(
    view,
    `(() => {
      const element = document.querySelector("orbit-reviewarea");
      return element?.iframe?.contentWindow && element.getConfiguration?.();
    })()`,
    "the embedded review area to initialize",
  );
}

type FrameTree = {
  frame: { id: string; url: string };
  childFrames?: FrameTree[];
};

function findEmbeddedFrameID(frameTree: FrameTree): string | null {
  if (frameTree.frame.url.startsWith(`${appOrigin}/embed`)) {
    return frameTree.frame.id;
  }
  for (const child of frameTree.childFrames ?? []) {
    const match = findEmbeddedFrameID(child);
    if (match) return match;
  }
  return null;
}

async function getEmbeddedExecutionContextID(
  view: Bun.WebView,
): Promise<number> {
  const frameID = await waitForValue<string>(
    view,
    `document.querySelector("orbit-reviewarea")?.iframe?.src.startsWith(${JSON.stringify(
      `${appOrigin}/embed`,
    )}) && "ready"`,
    "the embedded frame navigation",
  ).then(async () => {
    const response = (await view.cdp("Page.getFrameTree")) as {
      frameTree: FrameTree;
    };
    return findEmbeddedFrameID(response.frameTree);
  });
  if (!frameID) {
    throw new Error(
      `Chrome did not report the embedded app frame: ${JSON.stringify(
        (await view.cdp("Page.getFrameTree")) as unknown,
      )}`,
    );
  }
  const world = (await view.cdp("Page.createIsolatedWorld", {
    frameId: frameID,
    worldName: `orbit-web-smoke-${makeID()}`,
  })) as { executionContextId?: number };
  assertCondition(
    world.executionContextId,
    "Chrome did not create a context for the embedded app frame",
  );
  return world.executionContextId;
}

async function getElementCenterInFrame(
  view: Bun.WebView,
  executionContextID: number,
  selector: string,
): Promise<{ x: number; y: number } | null> {
  const response = (await view.cdp("Runtime.evaluate", {
    contextId: executionContextID,
    returnByValue: true,
    expression: `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      if (
        !rect.width ||
        !rect.height ||
        rect.right <= 0 ||
        rect.bottom <= 0 ||
        rect.left >= innerWidth ||
        rect.top >= innerHeight
      ) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  })) as { result?: { value?: { x: number; y: number } | null } };
  return response.result?.value ?? null;
}

async function clickEmbeddedElement(
  view: Bun.WebView,
  executionContextID: number,
  selector: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMillis;
  let framePoint: { x: number; y: number } | null = null;
  while (Date.now() < deadline) {
    framePoint = await getElementCenterInFrame(
      view,
      executionContextID,
      selector,
    );
    if (framePoint) break;
    await delay(100);
  }
  assertCondition(
    framePoint,
    `Couldn't find ${selector} in the embedded frame`,
  );
  const frameOffset = await waitForValue<{ x: number; y: number }>(
    view,
    `(() => {
      const iframe = document.querySelector("orbit-reviewarea")?.iframe;
      if (!iframe) return null;
      const rect = iframe.getBoundingClientRect();
      return { x: rect.left, y: rect.top };
    })()`,
    "the embedded frame position",
  );
  await view.click(frameOffset.x + framePoint.x, frameOffset.y + framePoint.y);
}

async function evaluateInFrame<T>(
  view: Bun.WebView,
  executionContextID: number,
  expression: string,
): Promise<T | undefined> {
  const response = (await view.cdp("Runtime.evaluate", {
    contextId: executionContextID,
    returnByValue: true,
    expression,
  })) as { result?: { value?: T } };
  return response.result?.value;
}

async function reviewPromptWhileSignedOut(view: Bun.WebView): Promise<number> {
  await waitForValue(
    view,
    `window.__orbitSmokeMessages.some((message) => message.type === "onLoad")`,
    "the iframe/host initialization handshake",
  );
  const executionContextID = await getEmbeddedExecutionContextID(view);
  await clickEmbeddedElement(
    view,
    executionContextID,
    '[role="button"][aria-label="Show Answer"]',
  );
  await clickEmbeddedElement(
    view,
    executionContextID,
    '[role="button"][aria-label="Remembered"]',
  );
  await waitForValue(
    view,
    `window.__orbitSmokeMessages.some((message) => message.type === "taskUpdate")`,
    "the signed-out review result to reach the host page",
  );
  return executionContextID;
}

type CDPMessage = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

class PopupSession {
  private nextID = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private readonly onMessage: EventListener;

  constructor(
    private readonly view: Bun.WebView,
    private readonly sessionID: string,
  ) {
    this.onMessage = (event) => {
      const data = (event as MessageEvent<unknown>).data as {
        sessionId?: string;
        message?: string;
      };
      if (data.sessionId !== this.sessionID || !data.message) return;
      const message = JSON.parse(data.message) as CDPMessage;
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(message.error.message ?? "Popup CDP error"));
      } else {
        waiter.resolve(message.result);
      }
    };
    view.addEventListener(
      "Target.receivedMessageFromTarget" as string,
      this.onMessage,
    );
  }

  async send<T>(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const id = this.nextID++;
    const response = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    await this.view.cdp("Target.sendMessageToTarget", {
      sessionId: this.sessionID,
      message: JSON.stringify({ id, method, params }),
    });
    return (await Promise.race([
      response,
      delay(timeoutMillis).then(() => {
        throw new Error(`Timed out waiting for popup CDP method ${method}`);
      }),
    ])) as T;
  }

  async evaluate<T>(expression: string): Promise<T | undefined> {
    const response = await this.send<{
      result?: { value?: T };
      exceptionDetails?: { text?: string };
    }>("Runtime.evaluate", { expression, returnByValue: true });
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.text ?? "JavaScript failed in login popup",
      );
    }
    return response.result?.value;
  }

  close(): void {
    this.view.removeEventListener(
      "Target.receivedMessageFromTarget" as string,
      this.onMessage,
    );
    for (const waiter of this.pending.values()) {
      waiter.reject(new Error("Login popup session closed"));
    }
    this.pending.clear();
  }
}

async function waitForPopupValue<T>(
  popup: PopupSession,
  expression: string,
  description: string,
): Promise<T> {
  const deadline = Date.now() + timeoutMillis;
  let lastValue: T | undefined;
  while (Date.now() < deadline) {
    lastValue = await popup.evaluate<T>(expression).catch(() => undefined);
    if (lastValue) return lastValue;
    await delay(100);
  }
  throw new Error(
    `Timed out waiting for ${description}; last value: ${JSON.stringify(lastValue)}`,
  );
}

async function signInThroughLoginUI(
  view: Bun.WebView,
  embeddedExecutionContextID: number,
  email: string,
  password: string,
  expectedMode: "register" | "signIn",
): Promise<PopupSession> {
  await view.cdp("Target.setDiscoverTargets", { discover: true });
  await clickEmbeddedElement(
    view,
    embeddedExecutionContextID,
    'input[placeholder*="email"]',
  );
  const enteredEmail = await evaluateInFrame<string>(
    view,
    embeddedExecutionContextID,
    `(() => {
      const input = document.querySelector('input[placeholder*="email"]');
      if (!input) return null;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(email)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return input.value;
    })()`,
  );
  assertCondition(
    enteredEmail === email,
    `The embedded onboarding form received ${enteredEmail} instead of ${email}`,
  );
  await clickEmbeddedElement(
    view,
    embeddedExecutionContextID,
    '[role="button"][aria-label="Continue"]',
  );

  const targetID = await (async () => {
    const deadline = Date.now() + timeoutMillis;
    while (Date.now() < deadline) {
      const targets = (await view.cdp("Target.getTargets")) as {
        targetInfos?: Array<{
          targetId: string;
          type: string;
          openerId?: string;
        }>;
      };
      const popupTarget = targets.targetInfos?.find(
        (target) => target.type === "page" && !!target.openerId,
      );
      if (popupTarget) return popupTarget.targetId;
      await delay(100);
    }
    throw new Error("The embedded onboarding form did not open a login popup");
  })();
  const attached = (await view.cdp("Target.attachToTarget", {
    targetId: targetID,
    flatten: false,
  })) as { sessionId?: string };
  assertCondition(
    attached.sessionId,
    "Chrome did not attach to the login popup",
  );
  const popup = new PopupSession(view, attached.sessionId);

  try {
    const popupURL = await waitForPopupValue<string>(
      popup,
      "location.href.startsWith('http') && location.href",
      "the login popup navigation",
    );
    const parsedPopupURL = new URL(popupURL);
    assertCondition(
      parsedPopupURL.origin === appOrigin &&
        parsedPopupURL.pathname === "/login" &&
        parsedPopupURL.searchParams.get("tokenTarget") === "opener" &&
        parsedPopupURL.searchParams.get("email") === email,
      `Unexpected embedded login popup URL: ${popupURL}`,
    );
    const buttonLabel =
      expectedMode === "register" ? "Create account" : "Sign in";
    await waitForPopupValue(
      popup,
      `document.querySelector('[role="button"][aria-label="${buttonLabel}"]') !== null`,
      `the ${buttonLabel} form`,
    );
    await popup.evaluate(
      "document.querySelector('input[type=\"password\"]').focus()",
    );
    await popup.send("Input.insertText", { text: password });
    await popup.evaluate(
      `document.querySelector('[role="button"][aria-label="${buttonLabel}"]').click()`,
    );
    return popup;
  } catch (error) {
    popup.close();
    throw error;
  }
}

async function signInThroughAuthEmulator(
  email: string,
  password: string,
): Promise<{ idToken: string; localId: string }> {
  type AuthResponse = {
    idToken?: string;
    localId?: string;
    error?: { message?: string };
  };
  const deadline = Date.now() + timeoutMillis;
  let lastResponse: Response | null = null;
  let lastBody: AuthResponse | null = null;
  while (Date.now() < deadline) {
    lastResponse = await fetchWithTimeout(
      `${authEmulatorURL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=web-smoke-test`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    lastBody = (await lastResponse.json()) as AuthResponse;
    if (lastResponse.ok && lastBody?.idToken && lastBody.localId) {
      return { idToken: lastBody.idToken, localId: lastBody.localId };
    }
    await delay(100);
  }
  throw new Error(
    `Couldn't authenticate ${email} against the local Auth emulator: ${lastBody?.error?.message ?? lastResponse?.status ?? "no response"}`,
  );
}

async function patchEvents(
  events: Array<Record<string, unknown>>,
  authorization: string,
): Promise<void> {
  const response = await fetchWithTimeout(`${apiBaseURL}/events`, {
    method: "PATCH",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(events),
  });
  if (response.status !== 204) {
    throw new Error(
      `Orbit API event write returned ${response.status}: ${await response.text()}`,
    );
  }
}

async function getEvents(
  taskID: string,
  authorization: string,
): Promise<EventList> {
  const url = new URL(`${apiBaseURL}/events`);
  url.searchParams.set("entityID", taskID);
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: authorization },
  });
  if (!response.ok) {
    throw new Error(
      `Orbit API event read returned ${response.status}: ${await response.text()}`,
    );
  }
  const body = (await response.json()) as EventList;
  assertCondition(
    body.type === "list" && body.hasMore === false && Array.isArray(body.items),
    "Orbit API returned an invalid event list",
  );
  return body;
}

async function waitForEvents(
  taskID: string,
  authorization: string,
  expectedCount: number,
): Promise<EventList> {
  const deadline = Date.now() + timeoutMillis;
  let events: EventList | null = null;
  while (Date.now() < deadline) {
    events = await getEvents(taskID, authorization);
    if (events.items.length === expectedCount) return events;
    await delay(200);
  }
  throw new Error(
    `Expected ${expectedCount} events for ${taskID}, got ${events?.items.length ?? 0}`,
  );
}

function assertEmbeddedReviewEvents(
  events: EventList,
  expectedCount: number,
): void {
  assertCondition(
    events.items.length === expectedCount,
    `Expected ${expectedCount} events, got ${events.items.length}`,
  );
  const embeddedEvents = events.items.slice(-2);
  assertCondition(
    embeddedEvents[0]?.type === "taskIngest",
    "The embedded flow did not store its task ingest event",
  );
  assertCondition(
    embeddedEvents[1]?.type === "taskRepetition" &&
      embeddedEvents[1]?.outcome === "remembered" &&
      typeof embeddedEvents[1]?.reviewSessionID === "string" &&
      embeddedEvents[1].reviewSessionID.startsWith("embedded/"),
    "The embedded flow did not store its remembered repetition event",
  );
}

async function runScenario({
  bundle,
  name,
  email,
  password,
  existingAccountMerge,
}: {
  bundle: Blob;
  name: string;
  email: string;
  password: string;
  existingAccountMerge: boolean;
}): Promise<void> {
  const question = `Orbit ${name} ${makeID()}?`;
  const answer = `Yes: ${name}.`;
  const host = startHostServer(bundle, question, answer);
  const consoleErrors: string[] = [];
  const view = new Bun.WebView({
    backend: "chrome",
    width: 800,
    height: 900,
    console(type, ...args) {
      if (type === "error") consoleErrors.push(args.map(String).join(" "));
    },
  });
  let login: PopupSession | null = null;

  try {
    await view.navigate(`http://localhost:${host.port}/`);
    console.log("\n  host loaded");
    const configuration = await getHostConfiguration(view);
    console.log("  embedded configuration received");
    const reviewItem = configuration.reviewItems[0];
    assertCondition(reviewItem, "The host did not extract its embedded prompt");
    const taskID = reviewItem.task.id;
    assertCondition(
      /^[0-9a-zA-Z_-]{22}$/.test(taskID),
      `The embedded prompt generated an invalid task ID: ${taskID}`,
    );

    const authorization = existingAccountMerge
      ? `Token ${existingAccount.personalAccessToken}`
      : null;
    if (authorization) {
      await patchEvents(
        [
          {
            id: makeID(),
            entityID: taskID,
            type: "taskIngest",
            timestampMillis: Date.now() - 1_000,
            provenance: null,
            metadata: { fixture: "web-smoke-existing-account" },
            spec: reviewItem.task.spec,
          },
        ],
        authorization,
      );
      const seededEvents = await getEvents(taskID, authorization);
      assertCondition(
        seededEvents.items.length === 1,
        "The existing-account fixture was not seeded cleanly",
      );
    }

    const embeddedExecutionContextID = await reviewPromptWhileSignedOut(view);
    console.log("  signed-out review completed");
    if (authorization) {
      const beforeSignInEvents = await getEvents(taskID, authorization);
      assertCondition(
        beforeSignInEvents.items.length === 1,
        "The signed-out review reached the existing account before sign-in",
      );
    }

    login = await signInThroughLoginUI(
      view,
      embeddedExecutionContextID,
      email,
      password,
      existingAccountMerge ? "signIn" : "register",
    );
    console.log("  login UI completed");
    const auth = await signInThroughAuthEmulator(email, password);
    console.log("  emulator authentication verified");
    const userAuthorization = `ID ${auth.idToken}`;
    const expectedEventCount = existingAccountMerge ? 3 : 2;
    const mergedEvents = await waitForEvents(
      taskID,
      userAuthorization,
      expectedEventCount,
    );
    console.log("  account events verified");
    assertEmbeddedReviewEvents(mergedEvents, expectedEventCount);
    assertCondition(
      consoleErrors.length === 0,
      `The browser logged errors:\n${consoleErrors.join("\n")}`,
    );
  } finally {
    login?.close();
    await view
      .cdp("Storage.clearDataForOrigin", {
        origin: appOrigin,
        storageTypes: "all",
      })
      .catch(() => {});
    view.close();
    host.stop(true);
    await delay(100);
  }
}

async function main(): Promise<void> {
  assertCondition(
    typeof Bun.WebView === "function",
    "This smoke test requires a Bun release with Bun.WebView",
  );
  await assertEmulatorsAreReady();
  const webApp = await startWebApp();
  try {
    const bundle = await buildWebComponent();
    const newUserEmail = `orbit-web-smoke+${makeID()}@example.com`;

    process.stdout.write("Web smoke: signed-out review into a new account… ");
    await runScenario({
      bundle,
      name: "new-account flow",
      email: newUserEmail,
      password: smokePassword,
      existingAccountMerge: false,
    });
    console.log("passed");

    process.stdout.write(
      "Web smoke: signed-out review merged into an existing account… ",
    );
    await runScenario({
      bundle,
      name: "existing-account merge",
      email: existingAccount.email,
      password: existingAccount.password,
      existingAccountMerge: true,
    });
    console.log("passed");
  } catch (error) {
    const expoOutput = webApp.getOutput();
    if (expoOutput) console.error(`\nRecent Expo output:\n${expoOutput}`);
    throw error;
  } finally {
    await stopWebApp(webApp);
  }
}

// A pending promise alone does not keep Bun alive, and Bun.WebView deliberately
// does not keep the event loop open between operations.
const keepAlive = setInterval(() => {}, 1_000);
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
