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
const hosted = process.argv.includes("--hosted");
const hostedSyncOrigin =
  process.env.ORBIT_HOSTED_WEB_SMOKE_SYNC_ORIGIN ?? "http://127.0.0.1:8787";
assertCondition(
  new URL(hostedSyncOrigin).protocol === "http:" &&
    ["127.0.0.1", "localhost"].includes(new URL(hostedSyncOrigin).hostname),
  "Hosted smoke sync service must be local",
);
const accessCodeOnly = process.argv.includes("--access-code");
const exportedAccessCodeOnly = process.argv.includes("--exported-access-code");
const hostedFixtureScript = path.join(
  packageRoot,
  "scripts/hosted_web_smoke_fixture.mjs",
);

async function hostedFixture<T>(command: string, input: unknown): Promise<T> {
  const child = Bun.spawn(
    ["node", "--experimental-transform-types", hostedFixtureScript, command],
    {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const deadline = setTimeout(() => child.kill(), 90_000);
  child.stdin.write(JSON.stringify(input));
  child.stdin.end();
  const [status, output, errors] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(deadline);
  assertCondition(
    status === 0,
    `Hosted fixture ${command} failed:\n${errors}\n${output}`,
  );
  return JSON.parse(output.trim().split("\n").at(-1)!) as T;
}

async function waitForPageText(
  view: Bun.WebView,
  expected: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMillis;
  while (Date.now() < deadline) {
    const text = await view.evaluate<string>("document.body.innerText");
    if (text?.includes(expected)) return;
    await delay(100);
  }
  throw new Error(
    `Browser did not display: ${expected}; page: ${await view.evaluate("JSON.stringify({url:location.href,text:document.body.innerText,spinners:document.querySelectorAll('[role=progressbar]').length})")}`,
  );
}

// Expo's exported lazy routes register differently from the development server.
// Test the artifact too, without consuming any production code or sending API
// writes: only the invalid-code response is needed to exercise route settling.
async function verifyExportedReviewAccessCode(): Promise<void> {
  const buildRoot = path.join(packageRoot, "web-build");
  assertCondition(
    await Bun.file(path.join(buildRoot, "index.html")).exists(),
    "Run build:web before the exported review-link smoke test",
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      const target = path.resolve(buildRoot, `.${pathname}`);
      const file = Bun.file(target);
      return new Response(
        target.startsWith(`${buildRoot}${path.sep}`) && (await file.exists())
          ? file
          : Bun.file(path.join(buildRoot, "index.html")),
      );
    },
  });
  const view = new Bun.WebView({ backend: "chrome", width: 800, height: 900 });
  try {
    await view.navigate("about:blank");
    await view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source: `(() => {
        const fetch = window.fetch.bind(window);
        window.__reviewCodeAttempted = false;
        window.fetch = async (input, init) => {
          const url = new URL(typeof input === "string" ? input : input.url, location.href);
          if (!url.pathname.startsWith("/api/")) return fetch(input, init);
          const isCode = url.pathname.endsWith("/consumeAccessCode");
          window.__reviewCodeAttempted ||= isCode;
          return new Response(isCode ? "Invalid review link" : "OK", {status: isCode ? 401 : 200});
        };
      })();`,
    });
    await view.navigate(
      `http://127.0.0.1:${server.port}/review?accessCode=${makeID()}`,
    );
    await waitForValue(
      view,
      "document.querySelector('input[placeholder*=email]') !== null && !location.search.includes('accessCode')",
      "exported lazy review route to settle and remove its spent code",
    );
    assertCondition(
      await view.evaluate<boolean>("window.__reviewCodeAttempted"),
      "Exported route did not attempt the review code",
    );
    await delay(2_000);
    assertCondition(
      !(await view.evaluate<string>("location.search"))?.includes("accessCode"),
      "Exported router restored the spent code",
    );
    console.log("Exported review-link fallback and stable URL cleanup passed");
  } finally {
    view.close();
    server.stop(true);
  }
}

// Reminder links use the shared review route even for accounts outside the
// Automerge cohort. Exercise real one-time codes and Firebase auth, not a
// fixture-specific UI path, without touching a customer's code or account.
async function verifyReviewAccessCodes(): Promise<void> {
  const signup = await fetchWithTimeout(
    `${authEmulatorURL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=smoke`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `orbit-review-link+${makeID()}@example.com`,
        password: smokePassword,
        returnSecureToken: true,
      }),
    },
  );
  assertCondition(
    signup.ok,
    `Review-link fixture signup failed: ${signup.status}`,
  );
  const auth = (await signup.json()) as { idToken: string; localId: string };
  const question = `Reminder link regression ${makeDisplayID()}`;
  const taskID = makeID();
  await patchEvents(
    [
      {
        id: makeID(),
        entityID: taskID,
        type: "taskIngest",
        timestampMillis: Date.now() - 1_000,
        provenance: null,
        metadata: { fixture: "reminder-link-smoke" },
        spec: {
          type: "memory",
          content: {
            type: "qa",
            body: { text: question, attachments: [] },
            answer: {
              text: "Reminder links should open reviews.",
              attachments: [],
            },
          },
        },
      },
    ],
    `ID ${auth.idToken}`,
  );
  const firestoreOrigin =
    "http://127.0.0.1:8080/v1/projects/metabook-system/databases/(default)/documents";
  async function createCode(expirationMillis = Date.now() + 60_000) {
    const code = makeID();
    const response = await fetchWithTimeout(
      `${firestoreOrigin}/accessCodes/${code}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer owner",
        },
        body: JSON.stringify({
          fields: {
            type: { stringValue: "oneTime" },
            userID: { stringValue: auth.localId },
            expirationTimestamp: {
              timestampValue: new Date(expirationMillis).toISOString(),
            },
          },
        }),
      },
    );
    assertCondition(
      response.ok,
      `Could not seed local access code: ${response.status}`,
    );
    return code;
  }
  const view = new Bun.WebView({
    backend: "chrome",
    width: 800,
    height: 900,
    console(type, ...args) {
      if (type === "error")
        console.error("Review-link browser error:", ...args);
    },
  });
  try {
    await view.navigate("about:blank");
    await view.cdp("Storage.clearDataForOrigin", {
      origin: appOrigin,
      storageTypes: "all",
    });
    const code = await createCode();
    await view.navigate(`${appOrigin}/review?accessCode=${code}`);
    await waitForPageText(view, question);
    assertCondition(
      !(await view.evaluate<string>("location.search"))?.includes("accessCode"),
      "Review route retained the access code in the URL",
    );
    const consumed = await fetchWithTimeout(
      `${firestoreOrigin}/accessCodes/${code}`,
      {
        headers: { Authorization: "Bearer owner" },
      },
    );
    assertCondition(
      consumed.status === 404,
      "One-time review code was not consumed",
    );
    console.log("  valid reminder link opened the legacy review queue");
    await view.navigate(`${appOrigin}/review?accessCode=${code}`);
    await waitForPageText(view, question);
    console.log("  consumed link retained the existing signed-in session");
    await view.evaluate(
      "document.querySelector('[role=button][aria-label=\"Show Answer\"]').click()",
    );
    await waitForValue(
      view,
      "document.querySelector('[role=button][aria-label=Remembered]') !== null",
      "the reminder-linked review answer",
    );
    await view.evaluate(
      "document.querySelector('[role=button][aria-label=Remembered]').click()",
    );
    const reviewed = await waitForEvents(taskID, `ID ${auth.idToken}`, 2);
    assertCondition(
      reviewed.items.some(
        (event) =>
          event.type === "taskRepetition" && event.outcome === "remembered",
      ),
      "Reminder-linked review was not persisted through legacy sync",
    );
    console.log("  reminder-linked review persisted through legacy sync");
  } finally {
    view.close();
  }
  for (const [name, code] of [
    ["invalid", makeID()],
    ["expired", await createCode(Date.now() - 60_000)],
  ]) {
    const signedOut = new Bun.WebView({
      backend: "chrome",
      width: 800,
      height: 900,
    });
    try {
      await signedOut.navigate("about:blank");
      await signedOut.cdp("Storage.clearDataForOrigin", {
        origin: appOrigin,
        storageTypes: "all",
      });
      await signedOut.navigate(`${appOrigin}/review?accessCode=${code}`);
      await waitForValue(
        signedOut,
        "document.querySelector('input[placeholder*=email]') !== null && document.querySelector('[role=button][aria-label=Continue]') !== null",
        `${name} review link to fall back to sign-in`,
      );
      console.log(`  ${name} reminder link fell back to sign-in`);
    } finally {
      signedOut.close();
    }
  }
}

async function verifyHostedLifecycle(
  view: Bun.WebView,
  idToken: string,
): Promise<void> {
  const original = `Lifecycle original ${makeDisplayID()}`;
  const created = await hostedFixture<{ lifecycleTaskID: string }>("create", {
    idToken,
    text: original,
  });
  await view.navigate(`${appOrigin}/review`);
  await waitForPageText(view, original);
  const edited = `Lifecycle edited ${makeDisplayID()}`;
  await hostedFixture("edit", {
    idToken,
    lifecycleTaskID: created.lifecycleTaskID,
    text: edited,
  });
  await view.navigate(`${appOrigin}/review`);
  await waitForPageText(view, edited);
  console.log("  browser edit projection verified");
  const replacement = `Lifecycle replacement ${makeDisplayID()}`;
  const replaced = await hostedFixture<{ lifecycleTaskID: string }>("replace", {
    idToken,
    lifecycleTaskID: created.lifecycleTaskID,
    text: replacement,
  });
  // Unlike editing a currently presented question, deleting it should advance
  // a live queue. No reload or fixture-specific route here.
  await waitForPageText(view, replacement);
  console.log("  browser creation/edit/delete projections verified");
  const rolled = await hostedFixture<{ catalogURL: string }>("rollover", {
    idToken,
  });
  await view.navigate(`${appOrigin}/review`);
  try {
    await waitForPageText(view, replacement);
  } catch (error) {
    // Observe only this isolated browser's new catalog records, without warming
    // the server first or recording identity tokens / task contents.
    const documentID = rolled.catalogURL.slice("automerge:".length);
    const records = await view.evaluate(`(async () => {
      const result = [];
      for (const {name} of await indexedDB.databases()) {
        if (!name?.startsWith("com.withorbit.automerge.")) continue;
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open(name);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const request = db.transaction("documents").objectStore("documents").getAll();
        const values = await new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        for (const value of values) {
          if (value.key?.[0] === ${JSON.stringify(documentID)})
            result.push({key: value.key.slice(0,2), bytes: value.binary?.byteLength});
        }
        db.close();
      }
      return result;
    })()`);
    console.error(
      "Cold rollover catalog storage records:",
      JSON.stringify(records),
    );
    throw error;
  }
  const fresh = await hostedFixture<{ catalogURL: string; prompts: string[] }>(
    "queue",
    { idToken },
  );
  assertCondition(
    fresh.catalogURL === rolled.catalogURL &&
      fresh.prompts.includes(replacement),
    "Fresh client did not open the new catalog and replacement prompt",
  );
  console.log("  browser cold rollover and independent fresh Repo verified");
  const afterRollover = `After rollover ${makeDisplayID()}`;
  await hostedFixture("replace", {
    idToken,
    lifecycleTaskID: replaced.lifecycleTaskID,
    text: afterRollover,
  });
  // This task exists only in the new catalog. An old-generation fallback must
  // not make the rollover assertion pass by displaying a cached question.
  await waitForPageText(view, afterRollover);
  console.log("  live browser selected the new catalog generation");
}

type EventList = {
  type: "list";
  hasMore: boolean;
  items: Array<Record<string, unknown>>;
};

type EmbeddedConfiguration = {
  tasks: Array<{
    taskID: string;
    spec: Record<string, unknown>;
  }>;
  reviewItems: Array<{
    taskID: string;
    componentID: string;
  }>;
  attachmentIDs: string[];
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

// Keep fixture text literal: Markdown otherwise turns random '--' into '–'.
function makeDisplayID(): string {
  return makeID().replace(/[-_]/g, "x");
}

function fixturePNG(): ArrayBuffer {
  const source = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const bytes = new Uint8Array(new ArrayBuffer(source.byteLength));
  bytes.set(source);
  return bytes.buffer;
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
    assertCondition(
      !hosted,
      "Hosted smoke must start its own Expo server; port 19006 is already in use",
    );
    return { process: null, getOutput: () => "" };
  } catch (error) {
    if (error instanceof Error && error.message.includes("already in use"))
      throw error;
    // Start our own server below.
  }

  let output = "";
  const expoExecutable = path.resolve(
    packageRoot,
    "../../node_modules/.bin/expo",
  );
  const webProcess = Bun.spawn(
    [expoExecutable, "start", "--web", "-p", "19006"],
    {
      cwd: packageRoot,
      env: { ...process.env, CI: "1" },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
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

function makeHostHTML(
  question: string,
  answer: string,
  includeAttachment: boolean,
  secondQuestion?: string,
): string {
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
      <orbit-prompt question="${escapeAttribute(question)}" answer="${escapeAttribute(answer)}"${includeAttachment ? ' question-attachments="/fixture.png"' : ""}></orbit-prompt>
    </orbit-reviewarea>
    ${secondQuestion ? `<orbit-reviewarea><orbit-prompt question="${escapeAttribute(secondQuestion)}" answer="Second answer"></orbit-prompt></orbit-reviewarea>` : ""}
  </body>
</html>`;
}

function startHostServer(
  bundle: Blob,
  question: string,
  answer: string,
  includeAttachment: boolean,
  secondQuestion?: string,
): ReturnType<typeof Bun.serve> {
  const html = makeHostHTML(
    question,
    answer,
    includeAttachment,
    secondQuestion,
  );
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
      if (pathname === "/fixture.png") {
        return new Response(fixturePNG(), {
          headers: { "Content-Type": "image/png" },
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
  reviewAreaIndex = 0,
): Promise<EmbeddedConfiguration> {
  return await waitForValue<EmbeddedConfiguration>(
    view,
    `(() => {
      const element = document.querySelectorAll("orbit-reviewarea")[${reviewAreaIndex}];
      return element?.iframe?.contentWindow && element.getConfiguration?.();
    })()`,
    "the embedded review area to initialize",
  );
}

type FrameTree = {
  frame: { id: string; url: string };
  childFrames?: FrameTree[];
};

function findEmbeddedFrameIDs(frameTree: FrameTree): string[] {
  return [
    ...(frameTree.frame.url.startsWith(`${appOrigin}/embed`)
      ? [frameTree.frame.id]
      : []),
    ...(frameTree.childFrames ?? []).flatMap(findEmbeddedFrameIDs),
  ];
}

async function getEmbeddedExecutionContextID(
  view: Bun.WebView,
  reviewAreaIndex = 0,
): Promise<number> {
  const frameID = await waitForValue<string>(
    view,
    `document.querySelectorAll("orbit-reviewarea")[${reviewAreaIndex}]?.iframe?.src.startsWith(${JSON.stringify(
      `${appOrigin}/embed`,
    )}) && "ready"`,
    "the embedded frame navigation",
  ).then(async () => {
    const response = (await view.cdp("Page.getFrameTree")) as {
      frameTree: FrameTree;
    };
    return findEmbeddedFrameIDs(response.frameTree)[reviewAreaIndex];
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
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (!element.contains(document.elementFromPoint(x, y))) return null;
      for (let current = element; current; current = current.parentElement) {
        const style = getComputedStyle(current);
        if (style.visibility === "hidden" || Number(style.opacity) === 0) return null;
      }
      return { x, y };
    })()`,
  })) as { result?: { value?: { x: number; y: number } | null } };
  return response.result?.value ?? null;
}

async function clickEmbeddedElement(
  view: Bun.WebView,
  executionContextID: number,
  selector: string,
  reviewAreaIndex = 0,
): Promise<void> {
  await view.evaluate(
    `document.querySelectorAll("orbit-reviewarea")[${reviewAreaIndex}]?.scrollIntoView({block: "start"})`,
  );
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
  if (!framePoint) {
    const diagnostics = await evaluateInFrame(
      view,
      executionContextID,
      `(() => {
        const element = document.querySelector(${JSON.stringify(selector)});
        if (!element) return { exists: false, bodyText: document.body.textContent };
        const rect = element.getBoundingClientRect();
        const ancestors = [];
        for (let current = element; current; current = current.parentElement) {
          const style = getComputedStyle(current);
          ancestors.push({
            tag: current.tagName,
            display: style.display,
            visibility: style.visibility,
            transform: style.transform,
            overflow: style.overflow,
            rect: current.getBoundingClientRect().toJSON(),
          });
        }
        return { exists: true, innerWidth, innerHeight, rect: rect.toJSON(), ancestors };
      })()`,
    );
    throw new Error(
      `Couldn't find visible ${selector} in the embedded frame: ${JSON.stringify(diagnostics)}`,
    );
  }
  const frameOffset = await waitForValue<{ x: number; y: number }>(
    view,
    `(() => {
      const area = document.querySelectorAll("orbit-reviewarea")[${reviewAreaIndex}];
      const iframe = area?.iframe;
      if (!iframe) return null;
      let rect = iframe.getBoundingClientRect();
      const targetY = rect.top + ${framePoint.y};
      if (targetY < 0 || targetY >= innerHeight) {
        window.scrollBy(0, targetY - innerHeight / 2);
        rect = iframe.getBoundingClientRect();
      }
      const hit = document.elementFromPoint(rect.left + ${framePoint.x}, rect.top + ${framePoint.y});
      if (hit !== iframe && hit !== area) return null;
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
    awaitPromise: true,
    expression,
  })) as { result?: { value?: T } };
  return response.result?.value;
}

async function waitForEmbeddedText(
  view: Bun.WebView,
  executionContextID: number,
  expected: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMillis;
  let text: string | undefined;
  while (Date.now() < deadline) {
    text = await evaluateInFrame<string>(
      view,
      executionContextID,
      'document.body.textContent ?? ""',
    );
    if (text?.includes(expected)) return;
    await delay(100);
  }
  throw new Error(`Embedded UI did not display ${expected}: ${text}`);
}

async function readPageReviews(
  view: Bun.WebView,
): Promise<Array<{ requestID: string; taskID: string; outcome: string }>> {
  return (
    (await view.evaluate<
      Array<{ requestID: string; taskID: string; outcome: string }>
    >(
      'window.__orbitSmokeMessages.filter(message => message.type === "pageReview").map(message => message.review)',
    )) ?? []
  );
}

// Test the actual renderer and transient publisher relay, never a fixture UI branch.
async function verifyCrossAreaReviews(bundle: Blob): Promise<void> {
  const first = `First review area ${makeDisplayID()}`;
  const second = `Second review area ${makeDisplayID()}`;
  const host = startHostServer(bundle, first, "First answer", false, second);
  const errors: string[] = [];
  const view = new Bun.WebView({
    backend: "chrome",
    width: 800,
    height: 900,
    console(type, ...args) {
      if (type === "error") errors.push(args.map(String).join(" "));
    },
  });
  try {
    await view.navigate("about:blank");
    await view.cdp("Storage.clearDataForOrigin", {
      origin: appOrigin,
      storageTypes: "all",
    });
    await view.cdp("Page.addScriptToEvaluateOnNewDocument", {
      source:
        'for(const name of ["Worker","SharedWorker"]) Object.defineProperty(globalThis,name,{configurable:true,value:class{constructor(){throw Error("Embed must not create "+name)}}});',
    });
    const hostURL = `http://localhost:${host.port}/`;
    await view.navigate(hostURL);
    await waitForValue(
      view,
      'window.__orbitSmokeMessages.filter(message => message.type === "ready").length >= 2',
      "both review areas to initialize",
    );
    const taskIDs = await Promise.all(
      [0, 1].map(
        async (index) =>
          (await getHostConfiguration(view, index)).tasks[0]!.taskID,
      ),
    );
    const contexts = await Promise.all(
      [0, 1].map((index) => getEmbeddedExecutionContextID(view, index)),
    );
    async function waitForPrompt(index: number, prompt: string) {
      const deadline = Date.now() + timeoutMillis;
      while (Date.now() < deadline) {
        if (
          await evaluateInFrame<boolean>(
            view,
            contexts[index]!,
            `Array.from(document.querySelectorAll("span,div")).some(element => {
            if(element.textContent !== ${JSON.stringify(prompt)} || element.children.length) return false;
            const rect=element.getBoundingClientRect();
            return rect.width>0 && rect.height>0 && rect.right>0 && rect.left<innerWidth && rect.bottom>0 && rect.top<innerHeight;
          })`,
          )
        )
          return;
        await delay(100);
      }
      throw Error(
        `Review area ${index} did not show ${prompt}; frame: ${await evaluateInFrame(view, contexts[index]!, "document.body.innerText")}; page reviews: ${JSON.stringify(await readPageReviews(view))}`,
      );
    }
    async function mark(index: number, label: "Forgotten" | "Remembered") {
      await clickEmbeddedElement(
        view,
        contexts[index]!,
        '[role="button"][aria-label="Show Answer"]',
        index,
      );
      await clickEmbeddedElement(
        view,
        contexts[index]!,
        `[role="button"][aria-label="${label}"]`,
        index,
      );
    }
    await waitForPrompt(0, first);
    await view.evaluate(
      'document.querySelectorAll("orbit-reviewarea")[1].scrollIntoView({block:"start"})',
    );
    await waitForPrompt(1, second);
    await mark(0, "Forgotten");
    await mark(1, "Remembered");
    await waitForPrompt(1, first);
    await mark(1, "Remembered");
    const reviews = (await readPageReviews(view)).filter((review) =>
      taskIDs.includes(review.taskID),
    );
    assertCondition(
      reviews.length === 3 &&
        new Set(reviews.map((review) => review.requestID)).size === 3 &&
        reviews.filter((review) => review.taskID === taskIDs[0]).length === 2 &&
        reviews.some(
          (review) =>
            review.taskID === taskIDs[0] && review.outcome === "forgotten",
        ) &&
        reviews.some(
          (review) =>
            review.taskID === taskIDs[0] && review.outcome === "remembered",
        ) &&
        reviews.some(
          (review) =>
            review.taskID === taskIDs[1] && review.outcome === "remembered",
        ),
      "Article retries must produce exactly three page-memory reviews",
    );
    const databases = await evaluateInFrame<Array<{ name?: string }>>(
      view,
      contexts[0]!,
      "indexedDB.databases()",
    );
    assertCondition(
      !(databases ?? []).some(
        ({ name }) =>
          name?.startsWith("com.withorbit.embedded") ||
          name?.startsWith("com.withorbit.automerge"),
      ),
      "Anonymous embed must not create an Orbit review database",
    );
    await view.navigate(hostURL);
    await waitForValue(
      view,
      'window.__orbitSmokeMessages.filter(message => message.type === "ready").length >= 2',
      "reloaded review areas",
    );
    for (const index of [0, 1]) {
      contexts[index] = await getEmbeddedExecutionContextID(view, index);
      await view.evaluate(
        `document.querySelectorAll("orbit-reviewarea")[${index}].scrollIntoView({block:"start"})`,
      );
      await waitForPrompt(index, index === 0 ? first : second);
    }
    assertCondition(
      (await readPageReviews(view)).length === 0,
      "Reload must discard anonymous reviews",
    );
    assertCondition(
      errors.length === 0,
      `Browser errors: ${errors.join("; ")}`,
    );
    console.log(
      "Cross-area anonymous progress, forgotten retry, no workers/database, and reload discard passed",
    );
  } finally {
    await view
      .cdp("Storage.clearDataForOrigin", {
        origin: appOrigin,
        storageTypes: "all",
      })
      .catch(() => {});
    view.close();
    host.stop(true);
  }
}

async function reviewPromptWhileSignedOut(
  view: Bun.WebView,
  taskID: string,
): Promise<string> {
  await waitForValue(
    view,
    'window.__orbitSmokeMessages.some(message => message.type === "ready")',
    "iframe handshake",
  );
  const context = await getEmbeddedExecutionContextID(view);
  await clickEmbeddedElement(
    view,
    context,
    '[role="button"][aria-label="Show Answer"]',
  );
  await clickEmbeddedElement(
    view,
    context,
    '[role="button"][aria-label="Remembered"]',
  );
  await waitForValue(
    view,
    `window.__orbitSmokeMessages.some(message => message.type === "pageReview" && message.review.taskID === ${JSON.stringify(taskID)})`,
    "anonymous page review",
  );
  const reviews = (await readPageReviews(view)).filter(
    (review) => review.taskID === taskID,
  );
  assertCondition(
    reviews.length === 1 && reviews[0]?.outcome === "remembered",
    "Signed-out review must exist exactly once in page memory",
  );
  return reviews[0]!.requestID;
}

async function reopenSignedOutReview(
  view: Bun.WebView,
  hostURL: string,
  expectedTaskID: string,
  discardedRequestID: string,
): Promise<number> {
  await view.navigate(hostURL);
  const configuration = await getHostConfiguration(view);
  assertCondition(
    configuration.tasks[0]?.taskID === expectedTaskID,
    "Reload changed the task ID",
  );
  assertCondition(
    (await readPageReviews(view)).length === 0,
    "Reload preserved anonymous progress",
  );
  const requestID = await reviewPromptWhileSignedOut(view, expectedTaskID);
  assertCondition(
    requestID !== discardedRequestID,
    "Fresh anonymous visit must have a new review identity",
  );
  return getEmbeddedExecutionContextID(view);
}

async function verifySignedInFailureAndRetry(
  view: Bun.WebView,
  bundle: Blob,
  idToken: string,
  errors: string[],
): Promise<void> {
  const host = startHostServer(
    bundle,
    `Online-only review ${makeDisplayID()}`,
    "Retry answer",
    false,
  );
  const errorStart = errors.length;
  try {
    await view.navigate(`http://localhost:${host.port}/`);
    const configuration = await getHostConfiguration(view);
    const context = await getEmbeddedExecutionContextID(view);
    await waitForEmbeddedText(view, context, "Saved to your account");
    await waitForEmbeddedText(view, context, "Show Answer");
    await evaluateInFrame(
      view,
      context,
      `(() => {
      window.__smokeEvents = [];
      for (const type of ["focus", "pointerdown", "pointerup", "click"]) {
        document.addEventListener(type, event => window.__smokeEvents.push({
          type, label: event.target.closest?.('[role="button"]')?.getAttribute("aria-label"), time: performance.now(),
        }), true);
      }
    })()`,
    );
    await clickEmbeddedElement(
      view,
      context,
      '[role="button"][aria-label="Show Answer"]',
    );
    const revealedDeadline = Date.now() + timeoutMillis;
    while (
      !(await getElementCenterInFrame(
        view,
        context,
        '[role="button"][aria-label="Remembered"]',
      ))
    ) {
      if (Date.now() >= revealedDeadline) {
        throw new Error(
          `Signed-in prompt did not reveal its answer; events: ${await evaluateInFrame(view, context, "JSON.stringify(window.__smokeEvents)")}`,
        );
      }
      await delay(100);
    }
    await view.cdp("Network.enable", {});
    await view.cdp("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await clickEmbeddedElement(
      view,
      context,
      '[role="button"][aria-label="Remembered"]',
    );
    await waitForEmbeddedText(
      view,
      context,
      "Keep this page open and try again",
    );
    assertCondition(
      await evaluateInFrame(
        view,
        context,
        'window.__smokeEvents.some(event => event.type === "click" && event.label === "Remembered")',
      ),
      `A refresh intercepted the offline review tap: ${await evaluateInFrame(view, context, "JSON.stringify(window.__smokeEvents)")}`,
    );
    assertCondition(
      await evaluateInFrame(
        view,
        context,
        '!!document.querySelector(\'[role="button"][aria-label="Remembered"]\')',
      ),
      "An unacknowledged signed-in mark advanced the review",
    );
    assertCondition(
      (await readPageReviews(view)).length === 0,
      "Signed-in review data escaped through the publisher relay",
    );
    await view.cdp("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await clickEmbeddedElement(
      view,
      context,
      'button[type="button"]:not([role="button"])',
    );
    await waitForEmbeddedText(view, context, "Saved to your account");
    await hostedFixture("verify", {
      idToken,
      taskID: configuration.tasks[0]!.taskID,
      spec: configuration.tasks[0]!.spec,
      attachmentIDs: [],
      pngBase64: "",
    });
    const expectedErrors = errors.splice(errorStart);
    assertCondition(
      expectedErrors.every(
        (error) =>
          error.includes("Could not save embedded mark") ||
          error.includes("ERR_INTERNET_DISCONNECTED"),
      ),
      `Unexpected errors during offline retry: ${expectedErrors.join("; ")}`,
    );
    console.log(
      "  actual offline mark stayed visible; online retry saved exactly one review",
    );
  } finally {
    await view
      .cdp("Network.emulateNetworkConditions", {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      })
      .catch(() => {});
    host.stop(true);
  }
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
  // A modal can finish laying out between measuring its field and the tap.
  // Check actual focus rather than inserting text into whichever element won.
  const focusDeadline = Date.now() + timeoutMillis;
  while (
    !(await evaluateInFrame<boolean>(
      view,
      embeddedExecutionContextID,
      `document.activeElement === document.querySelector('input[placeholder*="email"]')`,
    ))
  ) {
    assertCondition(
      Date.now() < focusDeadline,
      "Could not focus the onboarding email field",
    );
    await clickEmbeddedElement(
      view,
      embeddedExecutionContextID,
      'input[placeholder*="email"]',
    );
    await delay(100);
  }
  await view.cdp("Input.insertText", { text: email });
  let enteredEmail: string | undefined;
  while (Date.now() < focusDeadline) {
    enteredEmail = await evaluateInFrame<string>(
      view,
      embeddedExecutionContextID,
      `document.querySelector('input[placeholder*="email"]')?.value`,
    );
    if (enteredEmail === email) break;
    await delay(20);
  }
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
    const diagnostics = await evaluateInFrame(
      view,
      embeddedExecutionContextID,
      "document.body.innerText",
    );
    throw new Error(
      `The embedded onboarding form did not open a login popup. Frame: ${diagnostics}`,
    );
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
  completeAuthentication,
  includeAttachment,
}: {
  bundle: Blob;
  name: string;
  email: string;
  password: string;
  existingAccountMerge: boolean;
  completeAuthentication: boolean;
  includeAttachment: boolean;
}): Promise<void> {
  const question = `Orbit ${name} ${makeDisplayID()}?`;
  const answer = `Yes: ${name}.`;
  const host = startHostServer(bundle, question, answer, includeAttachment);
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
    const task = configuration.tasks[0];
    assertCondition(task, "The host did not extract its embedded prompt");
    const taskID = task.taskID;
    assertCondition(
      /^[0-9a-zA-Z_-]{22}$/.test(taskID),
      `The embedded prompt generated an invalid task ID: ${taskID}`,
    );
    assertCondition(
      configuration.attachmentIDs.length === (includeAttachment ? 1 : 0),
      "The host did not extract the expected attachment allowlist",
    );

    let existingRootURL: string | undefined;
    const existingTaskID = makeID();
    if (hosted && existingAccountMerge) {
      const response = await fetchWithTimeout(
        `${authEmulatorURL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=smoke`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      );
      assertCondition(
        response.ok,
        `Fixture account signup failed: ${response.status}`,
      );
      const auth = (await response.json()) as { idToken: string };
      existingRootURL = (
        await hostedFixture<{ rootURL: string }>("seed", {
          idToken: auth.idToken,
          existingTaskID,
        })
      ).rootURL;
      console.log(
        "  existing hosted account seeded through ordinary store writes",
      );
    }
    const authorization =
      existingAccountMerge && !hosted
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
            spec: task.spec,
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

    const reviewID = await reviewPromptWhileSignedOut(view, taskID);
    console.log("  signed-out review completed");
    if (authorization) {
      const beforeSignInEvents = await getEvents(taskID, authorization);
      assertCondition(
        beforeSignInEvents.items.length === 1,
        "The signed-out review reached the existing account before sign-in",
      );
    }

    const embeddedExecutionContextID = await reopenSignedOutReview(
      view,
      `http://localhost:${host.port}/`,
      taskID,
      reviewID,
    );
    console.log(
      "  reload discarded anonymous progress; current visit reviewed again",
    );

    if (!completeAuthentication) {
      assertCondition(
        consoleErrors.length === 0,
        `The browser logged errors:\n${consoleErrors.join("\n")}`,
      );
      return;
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
    if (hosted) {
      // Firebase auth completion does not mean its asynchronous provisioning
      // trigger has finished. Observe the real account record, then use the
      // product's existing retry control if the first save reached it too soon.
      await hostedFixture("provisioned", { idToken: auth.idToken });
      const saveDeadline = Date.now() + timeoutMillis;
      let retriedProvisioning = false;
      for (;;) {
        const text = await evaluateInFrame<string>(
          view,
          embeddedExecutionContextID,
          // Completion hides its status caption after an account-keyed remount.
          // Its DOM text still reflects the actual pending/acknowledged state.
          'document.body.textContent ?? ""',
        );
        if (text?.includes(`Saved to your account: ${email.toLowerCase()}`))
          break;
        assertCondition(
          Date.now() < saveDeadline,
          `Signed-in progress did not save: ${text}`,
        );
        if (text?.includes("Orbit couldn't save or load your progress:")) {
          assertCondition(
            text.includes("404: account-not-provisioned"),
            `Unexpected account save failure: ${text}`,
          );
          if (!retriedProvisioning) {
            await clickEmbeddedElement(
              view,
              embeddedExecutionContextID,
              'button[type="button"]:not([role="button"])',
            );
            retriedProvisioning = true;
            console.log("  actual Try again submitted after provisioning");
          }
        }
        await delay(100);
      }
      const input = {
        idToken: auth.idToken,
        taskID,
        spec: task.spec,
        attachmentIDs: configuration.attachmentIDs,
        pngBase64: Buffer.from(fixturePNG()).toString("base64"),
        existingRootURL,
        existingTaskID,
      };
      await hostedFixture("verify", input);
      console.log(
        "  independent Repo verified HTTP task, one review, and attachment bytes",
      );
      // A fresh thin client reads the acknowledged account state without replaying
      // anonymous work or replacing the account root.
      await view.navigate(`http://localhost:${host.port}/`);
      await getHostConfiguration(view);
      await waitForEmbeddedText(
        view,
        await getEmbeddedExecutionContextID(view),
        "collected",
      );
      await hostedFixture("verify", input);
      if (!existingAccountMerge)
        await verifySignedInFailureAndRetry(
          view,
          bundle,
          auth.idToken,
          consoleErrors,
        );
      if (existingAccountMerge) await verifyHostedLifecycle(view, auth.idToken);
      assertCondition(
        consoleErrors.length === 0,
        `The browser logged errors:\n${consoleErrors.join("\n")}`,
      );
      return;
    }
    const expectedEventCount = existingAccountMerge ? 3 : 2;
    const mergedEvents = await waitForEvents(
      taskID,
      userAuthorization,
      expectedEventCount,
    );
    console.log("  account events verified");
    assertEmbeddedReviewEvents(mergedEvents, expectedEventCount);
    for (const attachmentID of configuration.attachmentIDs) {
      const response = await fetchWithTimeout(
        `${apiBaseURL}/attachments/${attachmentID}`,
        {
          headers: { Authorization: userAuthorization },
        },
      );
      assertCondition(
        response.ok,
        `Legacy attachment read failed: ${response.status}`,
      );
      const actual = Buffer.from(await response.arrayBuffer());
      assertCondition(
        actual.equals(Buffer.from(fixturePNG())),
        "Legacy attachment bytes changed",
      );
      assertCondition(
        response.headers.get("content-type")?.startsWith("image/png"),
        "Legacy attachment lost its MIME type",
      );
    }
    console.log("  independent API read verified attachment bytes");
    assertCondition(
      consoleErrors.length === 0,
      `The browser logged errors:\n${consoleErrors.join("\n")}`,
    );
  } catch (error) {
    if (hosted) {
      console.error("Hosted browser errors:", consoleErrors);
      try {
        const frame = await getEmbeddedExecutionContextID(view);
        console.error(
          "Hosted frame state:",
          await evaluateInFrame(
            view,
            frame,
            "JSON.stringify({text:document.body.innerText,requests:performance.getEntriesByType('resource').filter(entry=>entry.name.includes('/v1/')).map(entry=>({url:entry.name,status:entry.responseStatus}))})",
          ),
        );
      } catch {
        /* The original failure remains authoritative. */
      }
    }
    throw error;
  } finally {
    login?.close();
    try {
      await view.cdp("Storage.clearDataForOrigin", {
        origin: appOrigin,
        storageTypes: "all",
      });
    } catch {
      // Navigation may have failed before the WebView established a session.
    }
    view.close();
    host.stop(true);
    await delay(100);
  }
}

async function main(): Promise<void> {
  if (exportedAccessCodeOnly) {
    await verifyExportedReviewAccessCode();
    return;
  }
  assertCondition(
    typeof Bun.WebView === "function",
    "This smoke test requires a Bun release with Bun.WebView",
  );
  await assertEmulatorsAreReady();
  let hostedServer: ReturnType<typeof Bun.spawn> | null = null;
  let serverOutput = "";
  let webApp: RunningWebApp | null = null;
  try {
    if (accessCodeOnly) {
      // Match production: the feature is on, but this legacy test account is
      // not in the explicitly gated dogfood cohort.
      process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC = "true";
      process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS =
        "not-the-local-test-account";
    }
    if (hosted) {
      process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC = "true";
      process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_ORIGIN = hostedSyncOrigin;
      process.env.EXPO_PUBLIC_AUTOMERGE_HOSTED_SYNC_AUTHENTICATION_USER_IDS =
        "";
      process.env.EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR_ORIGIN = authEmulatorURL;
      try {
        await fetchWithTimeout(`${hostedSyncOrigin}/_health`);
        throw new Error(
          `${hostedSyncOrigin} is already in use; stop that local test server first`,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes("already in use"))
          throw error;
      }
      hostedServer = Bun.spawn(
        [
          "node",
          "--experimental-transform-types",
          hostedFixtureScript,
          "serve",
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      const append = (text: string) => {
        serverOutput = (serverOutput + text).slice(-20_000);
      };
      void drainStream(hostedServer.stdout, append);
      void drainStream(hostedServer.stderr, append);
      await waitForURL(
        `${hostedSyncOrigin}/_ready`,
        Date.now() + timeoutMillis,
      );
    }
    webApp = await startWebApp();
    if (!hosted) await verifyReviewAccessCodes();
    if (accessCodeOnly) return;
    const bundle = await buildWebComponent();
    await verifyCrossAreaReviews(bundle);
    const newUserEmail = `orbit-web-smoke+${makeID()}@example.com`;

    process.stdout.write(
      "Web smoke: anonymous page progress is discarded on reload… ",
    );
    await runScenario({
      bundle,
      name: "anonymous page visit",
      email: newUserEmail,
      password: smokePassword,
      existingAccountMerge: false,
      completeAuthentication: false,
      includeAttachment: true,
    });
    console.log("passed");

    process.stdout.write("Web smoke: signed-out review into a new account… ");
    await runScenario({
      bundle,
      name: "new-account flow",
      email: newUserEmail,
      password: smokePassword,
      existingAccountMerge: false,
      completeAuthentication: true,
      includeAttachment: true,
    });
    console.log("passed");

    process.stdout.write(
      "Web smoke: signed-out review merged into an existing account… ",
    );
    await runScenario({
      bundle,
      name: "existing-account merge",
      email: hosted
        ? `orbit-web-existing+${makeID()}@example.com`
        : existingAccount.email,
      password: existingAccount.password,
      existingAccountMerge: true,
      completeAuthentication: true,
      includeAttachment: true,
    });
    console.log("passed");
  } catch (error) {
    const expoOutput = webApp?.getOutput();
    if (expoOutput) console.error(`\nRecent Expo output:\n${expoOutput}`);
    if (hosted && serverOutput)
      console.error(`\nRecent isolated sync output:\n${serverOutput}`);
    throw error;
  } finally {
    if (webApp) await stopWebApp(webApp);
    hostedServer?.kill();
    if (hostedServer) await hostedServer.exited;
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
