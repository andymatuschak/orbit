import { createHash } from "node:crypto";
import type { HostedVaultAccountRecord } from "@withorbit/api";
import { getUserMetadata } from "../src/db/firebaseAccountData.js";
import { getAuth } from "../src/db/firebaseAuth.js";
import {
  assertValidHostedAccountProvisioningInput,
  getHostedVaultAccount,
  provisionHostedVaultAccount,
  type HostedAccountProvisioningInput,
} from "../src/db/hostedVaultAccounts.js";
import { getApp } from "../src/firebaseApp.js";

const options = parseArguments(process.argv.slice(2));
process.env.GCLOUD_PROJECT = options.projectID;
process.env.GOOGLE_CLOUD_PROJECT = options.projectID;
getApp();

const user = await getAuth()
  .getUserByEmail(options.email)
  .catch(() => {
    throw new Error("Firebase account was not found");
  });
if (!user.email) throw new Error("Firebase account has no email address");
const userMetadata = await getUserMetadata(user.uid);
if (!userMetadata) throw new Error("Firebase account has no metadata record");

const input: HostedAccountProvisioningInput = {
  authIssuer: `https://securetoken.google.com/${options.projectID}`,
  authSubject: user.uid,
  emailAddress: user.email,
  registrationTimestampMillis: validRegistrationTimestampMillis(
    userMetadata.registrationTimestampMillis,
    user.metadata.creationTime,
  ),
  mode: "legacy",
};
assertValidHostedAccountProvisioningInput(input);
const existing = await getHostedVaultAccount(user.uid);
if (existing) assertSafeLegacyAccount(existing, input);

const disposition = options.apply
  ? await provisionHostedVaultAccount(input)
  : existing
    ? "existing"
    : "would-create";
if (options.apply) {
  const stored = await getHostedVaultAccount(user.uid);
  if (!stored) throw new Error("Provisioned account could not be reloaded");
  assertSafeLegacyAccount(stored, input);
}

console.info(
  JSON.stringify({
    event: "legacy_hosted_account_provisioning",
    apply: options.apply,
    accountFingerprint: createHash("sha256")
      .update(`orbit-account:${options.projectID}\0${user.uid}`)
      .digest("hex")
      .slice(0, 24),
    disposition,
  }),
);

function parseArguments(arguments_: readonly string[]) {
  let apply = false;
  let projectID: string | undefined;
  let email: string | undefined;
  let confirmedEmail: string | undefined;
  for (let index = 0; index < arguments_.length; index++) {
    const argument = arguments_[index];
    if (argument === "--apply" && !apply) {
      apply = true;
      continue;
    }
    const value = arguments_[++index];
    if (!value || value.startsWith("--")) throw usageError();
    if (argument === "--project-id" && projectID === undefined) {
      projectID = value;
    } else if (argument === "--email" && email === undefined) {
      email = value;
    } else if (
      argument === "--confirm-email" &&
      confirmedEmail === undefined
    ) {
      confirmedEmail = value;
    } else {
      throw usageError();
    }
  }
  if (
    !projectID ||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projectID) ||
    !email ||
    (apply ? confirmedEmail !== email : confirmedEmail !== undefined)
  ) {
    throw usageError();
  }
  return { apply, projectID, email };
}

function usageError() {
  return new Error(
    "Usage: provisionLegacyHostedVaultAccount.ts --project-id PROJECT --email EMAIL [--apply --confirm-email EMAIL]",
  );
}

function assertSafeLegacyAccount(
  record: HostedVaultAccountRecord,
  identity: HostedAccountProvisioningInput,
) {
  if (
    record.authIssuer !== identity.authIssuer ||
    record.authSubject !== identity.authSubject ||
    record.migration.mode !== "legacy" ||
    record.root.status !== "unbound" ||
    record.notificationMode !== "legacy"
  ) {
    throw new Error("Existing hosted account is not a safe legacy record");
  }
}

function validRegistrationTimestampMillis(
  storedTimestampMillis: unknown,
  authCreationTime: string,
): number {
  if (Number.isSafeInteger(storedTimestampMillis)) {
    return storedTimestampMillis as number;
  }
  const authCreationTimestampMillis = Date.parse(authCreationTime);
  if (!Number.isSafeInteger(authCreationTimestampMillis)) {
    throw new Error("Firebase account has no valid registration timestamp");
  }
  return authCreationTimestampMillis;
}
