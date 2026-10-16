import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  defaultLabConfigurationPath,
  loadLabConfiguration,
} from "../src/config.js";

const label = "org.andymatuschak.orbit-lab";

export function serviceDefinition(input: {
  node: string;
  repository: string;
  configuration: string;
  log: string;
}) {
  return {
    Label: label,
    ProgramArguments: [
      input.node,
      path.join(
        input.repository,
        "packages/automerge-sync-server/dist/index.js",
      ),
      "--config",
      input.configuration,
    ],
    WorkingDirectory: input.repository,
    RunAtLoad: true,
    KeepAlive: true,
    ThrottleInterval: 10,
    ExitTimeOut: 30,
    Umask: 0o077,
    StandardOutPath: input.log,
    StandardErrorPath: input.log,
  };
}

async function main() {
  if (process.platform !== "darwin")
    throw new Error("The login service requires macOS");
  const [action = "status", flag, customConfiguration] = process.argv.slice(2);
  if (
    !["install", "start", "stop", "restart", "status", "uninstall"].includes(
      action,
    ) ||
    (flag &&
      (action !== "install" || flag !== "--config" || !customConfiguration)) ||
    process.argv.length > 5
  )
    throw new Error(
      "Expected install [--config <private config>], start|stop|restart|status|uninstall",
    );
  const domain = `gui/${process.getuid!()}`;
  const service = `${domain}/${label}`;
  const repository = path.resolve(import.meta.dirname, "../../..");
  const agent = path.join(
    os.homedir(),
    "Library/LaunchAgents",
    `${label}.plist`,
  );
  const log = path.join(os.homedir(), "Library/Logs/Orbit Lab/server.log");
  const launchctl = (...args: string[]) =>
    execFileSync("/bin/launchctl", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  const runningJob = () => {
    try {
      return launchctl("print", service);
    } catch {
      return null;
    }
  };
  const stop = async () => {
    const job = runningJob();
    if (!job) return;
    const pid = Number(job.match(/\n\s*pid = (\d+)/)?.[1]);
    launchctl("bootout", service);
    // bootout returns before the old job finishes exiting. Wait before a
    // bootstrap or an offline snapshot; never replace graceful flush with -k.
    for (let attempt = 0; attempt < 140; attempt++) {
      let alive = false;
      if (pid) {
        try {
          process.kill(pid, 0);
          alive = true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      if (!alive && !runningJob()) return;
      await delay(250);
    }
    throw new Error(
      `Orbit Lab is still stopping. Inspect ${log} before restarting.`,
    );
  };
  if (action === "stop" || action === "uninstall") {
    await stop();
    if (action === "uninstall") await fs.rm(agent, { force: true });
    console.log(
      `Orbit Lab ${action === "stop" ? "stopped" : "login service removed"}; vault and updates retained.`,
    );
    return;
  }
  let configuration = path.resolve(
    customConfiguration ?? defaultLabConfigurationPath,
  );
  if (action !== "install") {
    // Status/start/restart follow the installed configuration, not a new default.
    if (!(await fs.stat(agent).catch(() => null)))
      throw new Error(
        "Orbit Lab login service is not installed. Run bun run lab:service install.",
      );
    const plist = JSON.parse(
      execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", agent], {
        encoding: "utf8",
      }),
    );
    configuration = plist.ProgramArguments.at(-1);
  }
  const config = await loadLabConfiguration(configuration);
  const readiness = async () => {
    try {
      return (
        await fetch(`http://127.0.0.1:${config.port}/_ready`, {
          signal: AbortSignal.timeout(1500),
        })
      ).status;
    } catch {
      return null;
    }
  };
  if (action === "status") {
    const job = runningJob();
    const ready = await readiness();
    console.log(
      JSON.stringify(
        {
          installed: true,
          loaded: !!job,
          pid: job?.match(/\n\s*pid = (\d+)/)?.[1] ?? null,
          lastExit: job?.match(/\n\s*last exit code = (.+)/)?.[1] ?? null,
          lastSignal:
            job?.match(/\n\s*last terminating signal = (.+)/)?.[1] ?? null,
          ready: ready === 200,
          log,
        },
        null,
        2,
      ),
    );
    if (!job || ready !== 200) {
      console.error(
        (await fs.readFile(log, "utf8").catch(() => "No server log yet."))
          .split("\n")
          .slice(-15)
          .join("\n"),
      );
      process.exitCode = 1;
    }
    return;
  }
  if (action === "install") {
    if (!runningJob() && (await readiness()) === 200)
      throw new Error(
        "Stop the foreground Lab backend before installing its login service.",
      );
    const node = await fs.realpath(
      execFileSync("/usr/bin/which", ["node"], { encoding: "utf8" }).trim(),
    );
    execFileSync(
      node,
      [
        "node_modules/@typescript/native/bin/tsc",
        "-b",
        "packages/tsconfig.json",
      ],
      { cwd: repository, stdio: "inherit" },
    );
    await fs.mkdir(path.dirname(agent), { recursive: true });
    await fs.mkdir(path.dirname(log), { recursive: true, mode: 0o700 });
    await (await fs.open(log, "a", 0o600)).close();
    const plist = execFileSync(
      "/usr/bin/plutil",
      ["-convert", "xml1", "-o", "-", "-"],
      {
        input: JSON.stringify(
          serviceDefinition({ node, repository, configuration, log }),
        ),
      },
    );
    await stop();
    await fs.writeFile(agent, plist, { mode: 0o600 });
  } else if (action === "restart") await stop();
  if (!runningJob()) launchctl("bootstrap", domain, agent);
  for (let attempt = 0; attempt < 60; attempt++) {
    if ((await readiness()) === 200) {
      console.log(`Orbit Lab ready; macOS keeps it running. Log: ${log}`);
      return;
    }
    await delay(250);
  }
  throw new Error(
    `Orbit Lab is not ready. Run lab:service status; log: ${log}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
