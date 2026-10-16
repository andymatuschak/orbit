import { expect, test } from "bun:test";
import { serviceDefinition } from "./labService.js";

test("launchd directly supervises one backend, independently of terminals, watch mode and Metro", () => {
  const definition = serviceDefinition({
    node: "/absolute/node",
    repository: "/a checkout with spaces/orbit",
    configuration: "/private/config.json",
    log: "/private/server.log",
  });
  expect(definition.ProgramArguments).toEqual([
    "/absolute/node",
    "/a checkout with spaces/orbit/packages/automerge-sync-server/dist/index.js",
    "--config",
    "/private/config.json",
  ]);
  expect(definition.WorkingDirectory).toBe("/a checkout with spaces/orbit");
  expect(definition.RunAtLoad).toBe(true);
  expect(definition.KeepAlive).toBe(true);
  expect(definition.ThrottleInterval).toBe(10);
  expect(definition.ExitTimeOut).toBe(30);
  expect(definition.Umask).toBe(0o077);
  expect(definition.StandardOutPath).toBe("/private/server.log");
  expect(definition.StandardErrorPath).toBe("/private/server.log");
});
