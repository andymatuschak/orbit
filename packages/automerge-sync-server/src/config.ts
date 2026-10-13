import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isValidAutomergeUrl } from "@automerge/automerge-repo";

export interface LabConfiguration {
  storageRoot: string;
  rootDocumentURL: string;
  pairingToken: string;
  updatesRoot: string;
  allowedOrigins: ReadonlySet<string>;
  port: number;
}

export const defaultLabDirectory = path.join(
  os.homedir(),
  "Library",
  "Application Support",
  "Orbit Lab",
);
export const defaultLabConfigurationPath = path.join(
  defaultLabDirectory,
  "config.json",
);

/** Setup imports a vault explicitly. Startup never manufactures an empty replacement. */
export async function loadLabConfiguration(
  configurationPath = defaultLabConfigurationPath,
): Promise<LabConfiguration> {
  const data = JSON.parse(await fs.readFile(configurationPath, "utf8"));
  if (!data || typeof data !== "object" || Array.isArray(data))
    throw new Error("Invalid Orbit Lab configuration");
  if (
    typeof data.storageRoot !== "string" ||
    !path.isAbsolute(data.storageRoot)
  )
    throw new Error(
      "Orbit Lab storageRoot must be an absolute persistent directory",
    );
  if (!isValidAutomergeUrl(data.rootDocumentURL))
    throw new Error("Orbit Lab requires its imported rootDocumentURL");
  if (
    typeof data.pairingToken !== "string" ||
    data.pairingToken.length < 32 ||
    data.pairingToken.length > 1024 ||
    /\s/.test(data.pairingToken)
  )
    throw new Error(
      "Orbit Lab requires a private pairing token of at least 32 characters",
    );
  const updatesRoot =
    data.updatesRoot ?? path.join(path.dirname(configurationPath), "updates");
  if (typeof updatesRoot !== "string" || !path.isAbsolute(updatesRoot))
    throw new Error("Orbit Lab updatesRoot must be an absolute directory");
  const port = data.port ?? 8787;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid Orbit Lab port");
  const origins: unknown = data.allowedOrigins ?? [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
  ];
  if (
    !Array.isArray(origins) ||
    origins.some(
      (origin) =>
        typeof origin !== "string" || new URL(origin).origin !== origin,
    )
  )
    throw new Error("Orbit Lab allowedOrigins must contain exact origins");
  return {
    storageRoot: data.storageRoot,
    rootDocumentURL: data.rootDocumentURL,
    pairingToken: data.pairingToken,
    updatesRoot,
    port,
    allowedOrigins: new Set(origins as string[]),
  };
}
