import path from "node:path";

export interface HostedSyncServerConfiguration {
  host: string;
  port: number;
  exposeMetrics: boolean;
  allowedOrigins: ReadonlySet<string>;
  storageRoot: string;
  maximumSocketLifetimeMillis: number;
  maximumSockets: number;
  maximumSocketsPerAccount: number;
  maximumLoadedAccounts: number;
  maximumMessageBytes: number;
  maximumAdmissionFrameBytes: number;
  admissionTimeoutMillis: number;
  maximumMessagesPerMinute: number;
  maximumControlRequestsPerMinute: number;
  maximumStorageBytesPerAccount: number;
  storageConcurrency: number;
  idleRepoTimeoutMillis: number;
  recycleAfterRepoCreations: number;
  recycleRSSBytes: number;
}

export function configurationFromEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): HostedSyncServerConfiguration {
  const storageRoot =
    environment.ORBIT_SYNC_STORAGE_ROOT ??
    path.resolve(".local/automerge-sync/storage");
  return {
    host: environment.HOST ?? "127.0.0.1",
    port: integer(environment.PORT, 8787),
    exposeMetrics: environment.ORBIT_SYNC_EXPOSE_METRICS === "true",
    allowedOrigins: new Set(
      (
        environment.ORBIT_SYNC_ALLOWED_ORIGINS ??
        "http://localhost:19006,http://127.0.0.1:19006"
      )
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
    storageRoot,
    maximumSocketLifetimeMillis: integer(
      environment.ORBIT_SYNC_MAX_SOCKET_LIFETIME_MILLIS,
      20 * 60_000,
    ),
    maximumSockets: integer(environment.ORBIT_SYNC_MAX_SOCKETS, 100),
    maximumSocketsPerAccount: integer(
      environment.ORBIT_SYNC_MAX_SOCKETS_PER_ACCOUNT,
      8,
    ),
    maximumLoadedAccounts: integer(
      environment.ORBIT_SYNC_MAX_LOADED_ACCOUNTS,
      4,
    ),
    maximumMessageBytes: integer(
      environment.ORBIT_SYNC_MAX_MESSAGE_BYTES,
      2 * 1_024 * 1_024,
    ),
    maximumAdmissionFrameBytes: integer(
      environment.ORBIT_SYNC_MAX_ADMISSION_BYTES,
      8 * 1_024,
    ),
    admissionTimeoutMillis: integer(
      environment.ORBIT_SYNC_ADMISSION_TIMEOUT_MILLIS,
      5_000,
    ),
    maximumMessagesPerMinute: integer(
      environment.ORBIT_SYNC_MAX_MESSAGES_PER_MINUTE,
      10_000,
    ),
    maximumControlRequestsPerMinute: integer(
      environment.ORBIT_SYNC_MAX_CONTROL_REQUESTS_PER_MINUTE,
      120,
    ),
    maximumStorageBytesPerAccount: integer(
      environment.ORBIT_SYNC_MAX_STORAGE_BYTES_PER_ACCOUNT,
      2 * 1_024 * 1_024 * 1_024,
    ),
    storageConcurrency: integer(environment.ORBIT_SYNC_STORAGE_CONCURRENCY, 32),
    idleRepoTimeoutMillis: integer(
      environment.ORBIT_SYNC_IDLE_REPO_TIMEOUT_MILLIS,
      5 * 60_000,
    ),
    recycleAfterRepoCreations: integer(
      environment.ORBIT_SYNC_RECYCLE_AFTER_REPO_CREATIONS,
      100,
    ),
    recycleRSSBytes: integer(
      environment.ORBIT_SYNC_RECYCLE_RSS_BYTES,
      1_500 * 1_024 * 1_024,
    ),
  };
}

function integer(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Invalid positive integer sync-server configuration");
  }
  return parsed;
}
