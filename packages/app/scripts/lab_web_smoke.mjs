import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Repo } from "@automerge/automerge-repo";
import {
  defaultOrbitSchedulerPolicy,
  TaskContentType,
  TaskSpecType,
} from "@withorbit/core";
import {
  PerTaskRepository,
  RepoPerTaskDocuments,
} from "@withorbit/store-automerge";
import {
  AtomicNodeFSStorageAdapter,
  LabSyncService,
  ensureStorageID,
} from "../../automerge-sync-server/dist/index.js";
import { readCapturedVault } from "../../automerge-sync-server/scripts/labSeed.ts";

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(appRoot, "../..");
const scratch = await fs.mkdtemp(
  path.join(os.tmpdir(), "orbit-lab-web-smoke-"),
);
const storageRoot = path.join(scratch, "repo");
const webPort = Number(process.env.ORBIT_WEB_SMOKE_PORT ?? 19016);
const webOrigin = `http://localhost:${webPort}`;
const token = "temporary-smoke-pairing-key-0123456789";
const prompts = [
  "Orbit Lab smoke: first durable review",
  "Orbit Lab smoke: offline second review",
];
let metro;
let service;
let view;
const nonlocalNetworkRequests = new Set();
try {
  const storage = new AtomicNodeFSStorageAdapter(storageRoot);
  await ensureStorageID(storage);
  const seed = new Repo({ storage, network: [] });
  const vault = await PerTaskRepository.create(new RepoPerTaskDocuments(seed), {
    vaultID: "lab-web-smoke",
    createdAtTimestampMillis: 1000,
    scheduler: defaultOrbitSchedulerPolicy,
    observations: {},
    attachments: {},
    tasks: Object.fromEntries(
      prompts.map((text, index) => [
        `${"0".repeat(21)}${index + 1}`,
        {
          createdAtTimestampMillis: 1000 + index,
          isDeleted: false,
          provenance: null,
          metadata: {},
          spec: {
            type: TaskSpecType.Memory,
            content: {
              type: TaskContentType.QA,
              body: { text, attachments: [] },
              answer: { text: `Answer ${index + 1}`, attachments: [] },
            },
          },
        },
      ]),
    ),
  });
  const configuration = {
    storageRoot,
    rootDocumentURL: vault.rootURL,
    pairingToken: token,
    updatesRoot: path.join(scratch, "updates"),
    allowedOrigins: new Set([webOrigin]),
    port: 0,
  };
  await vault.close();
  await seed.shutdown();
  service = new LabSyncService(configuration);
  configuration.port = (await service.start()).port;
  const origin = `http://127.0.0.1:${configuration.port}`;
  const log = await fs.open(path.join(scratch, "metro.log"), "w");
  metro = Bun.spawn(
    [
      process.execPath,
      path.join(repositoryRoot, "node_modules/expo/bin/cli"),
      "start",
      "--clear",
      "--web",
      "--host",
      "localhost",
      "--port",
      String(webPort),
    ],
    {
      cwd: appRoot,
      env: { ...process.env, EXPO_PUBLIC_ORBIT_LAB_ORIGIN: origin, CI: "1" },
      stdout: log.fd,
      stderr: log.fd,
    },
  );
  await log.close();
  await eventually(async () => {
    if (metro.exitCode !== null) throw new Error("Metro exited before startup");
    assert.equal((await fetch(`${webOrigin}/status`)).status, 200);
  }, 60_000);
  view = new Bun.WebView({ backend: "chrome", width: 800, height: 1000 });
  await view.navigate("about:blank");
  await view.cdp("Network.enable", {});
  // Observe browser-level traffic too: script, image, CSS/font and XHR loads
  // bypass a window.fetch wrapper, including attempts CDP blocks afterward.
  const recordRequest = (url, type) => {
    const target = new URL(url);
    if (
      ["http:", "https:", "ws:", "wss:"].includes(target.protocol) &&
      !["localhost", "127.0.0.1"].includes(target.hostname)
    ) {
      nonlocalNetworkRequests.add(`${type} ${target.origin}`);
    }
  };
  view.addEventListener("Network.requestWillBeSent", ({ data }) =>
    recordRequest(data.request.url, data.type),
  );
  view.addEventListener("Network.webSocketCreated", ({ data }) =>
    recordRequest(data.url, "WebSocket"),
  );
  await view.cdp("Network.setBlockedURLs", { urls: ["https://*"] });
  await view.cdp("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const allowed = url => ['localhost','127.0.0.1'].includes(new URL(url, location.href).hostname);
    const nativeFetch = window.fetch.bind(window);
    window.__nonlocalRequests = [];
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      if (!allowed(url)) { window.__nonlocalRequests.push(url); throw new Error('Nonlocal request blocked'); }
      return nativeFetch(input, init);
    };
    const NativeSocket = window.WebSocket;
    window.WebSocket = class extends NativeSocket { constructor(url, protocols) {
      if (!allowed(url)) { window.__nonlocalRequests.push(url); throw new Error('Nonlocal socket blocked'); }
      super(url, protocols);
    } };
  })();`,
  });
  await view.navigate(`${webOrigin}/review`);
  await waitText("Pair with Lab");
  // Actual DOM input events and controls, not a fixture-specific application path.
  await view.evaluate(`(() => {
    for (const [label, value] of ${JSON.stringify([
      ["Lab server origin", origin],
      ["Pairing key", token],
    ])}) {
      const field = document.querySelector('input[aria-label="' + label + '"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await clickText("Pair with Lab");
  await waitText(prompts[0]);
  await clickText("Show Answer");
  await waitText("Answer 1");
  await clickText("Remembered");
  await waitText(prompts[1]);
  await service.shutdown();
  service = undefined;
  assert.deepEqual(await view.evaluate("window.__nonlocalRequests"), []);
  await view.navigate(`${webOrigin}/review`);
  await waitText(prompts[1]);
  await clickText("Show Answer");
  await waitText("Answer 2");
  await clickText("Remembered");
  service = new LabSyncService(configuration);
  await service.start();
  await eventually(async () => {
    const captured = await readCapturedVault({
      storageRoot,
      rootDocumentURL: configuration.rootDocumentURL,
    });
    assert.equal(
      Object.values(captured.vault.observations).filter(
        (item) => item.kind === "review",
      ).length,
      2,
    );
  });
  assert.deepEqual(await view.evaluate("window.__nonlocalRequests"), []);
  assert.deepEqual([...nonlocalNetworkRequests], []);
  console.log(
    "Private browser smoke passed: real pairing, review, offline reload/review, and reconnect convergence; no public HTTP/socket calls.",
  );
} catch (error) {
  console.error(
    (
      await fs.readFile(path.join(scratch, "metro.log"), "utf8").catch(() => "")
    ).slice(-5000),
  );
  if (view)
    console.error(
      await view
        .evaluate("document.body.innerText")
        .catch(() => "Browser unavailable"),
    );
  throw error;
} finally {
  view?.close();
  metro?.kill();
  if (metro) await metro.exited;
  await service?.shutdown();
  await fs.rm(scratch, { recursive: true, force: true });
}

async function waitText(text) {
  await eventually(async () =>
    assert.ok(
      (await view.evaluate("document.body.innerText"))?.includes(text),
      `Missing ${text}`,
    ),
  );
}
async function clickText(text) {
  await view.click(`[role="button"][aria-label=${JSON.stringify(text)}]`, {
    timeout: 30_000,
  });
}
async function eventually(assertion, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await Bun.sleep(100);
    }
  }
}
