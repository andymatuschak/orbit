import { readFile } from "node:fs/promises";
import type { HostedVaultAccountRecord } from "@withorbit/api";
import {
  HostedSyncService,
  InMemoryHostedVaultAccountStore,
  type FirebaseIDTokenVerifier,
} from "@withorbit/automerge-sync-server";

interface Fixture {
  accountID: string;
  authenticationUserID: string;
  rootDocumentURL: string;
  storageRoot: string;
}

const issuer = "https://securetoken.google.com/orbit-ios-hosted-fetch-smoke";

async function main() {
  const fixturePath = process.argv[2];
  if (!fixturePath) {
    throw new Error("Usage: ios_hosted_fetch_smoke_server.ts <fixture.json>");
  }
  const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
  const account: HostedVaultAccountRecord = {
    schemaVersion: 1,
    authIssuer: issuer,
    authSubject: fixture.authenticationUserID,
    emailAddress: "test@test.com",
    registrationTimestampMillis: Date.now() - 60_000,
    hostedVaultID: fixture.accountID,
    root: {
      status: "bound",
      documentURL: fixture.rootDocumentURL as never,
      boundAtTimestampMillis: Date.now(),
    },
    migration: {
      mode: "automerge",
      source: "new-account",
      cutoverAtTimestampMillis: Date.now() - 1_000,
      rollbackUntilTimestampMillis: null,
      legacyArchiveKey: null,
    },
    notificationMode: "pending",
  };
  const verifier: FirebaseIDTokenVerifier = {
    async verifyIDToken(token) {
      if (!token) throw new Error("Missing test Firebase credential");
      return {
        subject: fixture.authenticationUserID,
        issuer,
        expiresAtTimestampMillis: Date.now() + 60_000,
      };
    },
  };
  const service = new HostedSyncService(
    {
      host: "127.0.0.1",
      port: 8787,
      exposeMetrics: true,
      allowedOrigins: new Set(),
      storageRoot: fixture.storageRoot,
      maximumSocketLifetimeMillis: 5 * 60_000,
      maximumSockets: 8,
      maximumSocketsPerAccount: 4,
      maximumLoadedAccounts: 2,
      maximumMessageBytes: 4 * 1_024 * 1_024,
      maximumAdmissionFrameBytes: 8_192,
      admissionTimeoutMillis: 5_000,
      maximumMessagesPerMinute: 20_000,
      maximumControlRequestsPerMinute: 1_000,
      maximumStorageBytesPerAccount: 128 * 1_024 * 1_024,
      storageConcurrency: 8,
      idleRepoTimeoutMillis: 60_000,
      recycleAfterRepoCreations: 1_000,
      recycleRSSBytes: 4 * 1_024 * 1_024 * 1_024,
    },
    {
      accounts: new InMemoryHostedVaultAccountStore([account]),
      verifier,
    },
  );

  const address = await service.start();
  console.log(`Hosted-fetch smoke server listening on ${address.port}`);

  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    await service.shutdown();
  }
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
