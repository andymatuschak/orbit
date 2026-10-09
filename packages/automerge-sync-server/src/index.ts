import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { deleteApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreHostedVaultAccountStore } from "./accounts/firestoreAccountStore.js";
import { FirebaseAdminIDTokenVerifier } from "./auth/firebaseIDTokenVerifier.js";
import { configurationFromEnvironment } from "./config.js";
import { HostedSyncService } from "./server.js";
import { SafeConsoleLogger } from "./logging/safeLogger.js";
import { loadReminderConfiguration } from "./notifications/reminderConfiguration.js";
import { ReminderIndex } from "./notifications/reminderIndex.js";
import { VaultReminderService } from "./notifications/vaultReminderService.js";

export * from "./accounts/accountStore.js";
export * from "./accounts/inMemoryAccountStore.js";
export * from "./auth/firebaseIDTokenVerifier.js";
export * from "./config.js";
export * from "./logging/safeLogger.js";
export * from "./repo/accountRepoPool.js";
export * from "./server.js";
export * from "./storage/accountStorage.js";
export * from "./storage/atomicNodeFSStorageAdapter.js";

export async function startHostedSyncProcess(
  arguments_: readonly string[] = process.argv.slice(2),
) {
  const enrollmentSubject = parseEnrollmentSubject(arguments_);
  const configuration = configurationFromEnvironment();
  const app = getApps()[0] ?? initializeApp();
  const firestore = getFirestore(app);
  const accounts = new FirestoreHostedVaultAccountStore(firestore);
  const logger = new SafeConsoleLogger();
  let reminderConfiguration;
  try {
    reminderConfiguration = await loadReminderConfiguration();
  } catch (error) {
    if (enrollmentSubject) throw error;
    // Mail provisioning is optional. Do not turn a missing secret into a sync
    // outage; index/Repo failures below remain fatal rather than being hidden.
    logger.error("reminders_unavailable", error);
  }
  if (enrollmentSubject && !reminderConfiguration)
    throw new Error("Reminder configuration required for enrollment");
  let reminders: VaultReminderService | undefined;
  await mkdir(configuration.storageRoot, { recursive: true, mode: 0o700 });
  const service = new HostedSyncService(configuration, {
    accounts,
    logger,
    verifier: new FirebaseAdminIDTokenVerifier(),
    createReminders: reminderConfiguration
      ? (repos) => {
          reminders = new VaultReminderService({
            ...reminderConfiguration,
            firestore,
            accounts,
            repos,
            logger,
            index: new ReminderIndex(
              path.join(configuration.storageRoot, "reminders.sqlite"),
            ),
          });
          return reminders;
        }
      : undefined,
  });
  if (enrollmentSubject) {
    // Same service-owned Repo pool, no HTTP listener or delivery loop. The
    // operator must stop its usual writer before opening this volume.
    try {
      await reminders!.enroll(enrollmentSubject);
    } finally {
      await service.shutdown();
      await deleteApp(app);
    }
    return service;
  }
  const address = await service.start();
  console.info(
    JSON.stringify({ event: "hosted_sync_started", port: address.port }),
  );

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await service.shutdown();
    await deleteApp(app);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());

  const recycleMonitor = setInterval(() => {
    void service.metrics().then(async (metrics) => {
      if (metrics.shouldRecycleProcess && !stopping) {
        await stop();
        process.exitCode = 0;
      }
    });
  }, 30_000);
  recycleMonitor.unref();
  return service;
}

function parseEnrollmentSubject(arguments_: readonly string[]) {
  if (!arguments_.length) return undefined;
  if (
    arguments_.length !== 3 ||
    arguments_[0] !== "--enroll-reminders" ||
    !arguments_[1] ||
    arguments_[1].length > 128 ||
    arguments_[1].startsWith("--") ||
    arguments_[2] !== "--confirm-server-stopped"
  )
    throw new TypeError(
      "Expected --enroll-reminders <auth-subject> --confirm-server-stopped",
    );
  return arguments_[1];
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await startHostedSyncProcess();
}
