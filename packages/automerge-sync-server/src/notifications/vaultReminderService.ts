import type { Firestore } from "firebase-admin/firestore";
import type { NotificationPreferences } from "@withorbit/core";
import {
  requireBoundHostedAccount,
  type HostedVaultAccountStore,
} from "../accounts/accountStore.js";
import type { AccountRepoPool } from "../repo/accountRepoPool.js";
import type { ServiceLogger } from "../logging/safeLogger.js";
import { ReminderIndex } from "./reminderIndex.js";
import {
  ReminderActionTokens,
  applyReminderAction,
  type ReminderAction,
} from "./reminderActions.js";
import { createReminderDelivery } from "./mailjetDelivery.js";
import { ReminderLoop } from "./reminderLoop.js";
import { localReminderTime } from "./reminderSchedule.js";
import { readReminderCatalog } from "./vaultReminders.js";

export interface HostedReminderController {
  actionTokens: ReminderActionTokens;
  preferences(subject: string): Promise<NotificationPreferences | undefined>;
  update(subject: string, action: ReminderAction, now: number): Promise<void>;
  start(): void;
  stop(): Promise<void>;
  close(): void;
}

/** Explicit enrollment during dogfood; no account enumeration or second Repo. */
export class VaultReminderService implements HostedReminderController {
  readonly actionTokens: ReminderActionTokens;
  private readonly loop: ReminderLoop;
  constructor(
    private readonly dependencies: {
      index: ReminderIndex;
      accounts: HostedVaultAccountStore;
      repos: AccountRepoPool;
      firestore: Firestore;
      logger: ServiceLogger;
      apiKey: string;
      secretKey: string;
      publicOrigin: string;
    },
  ) {
    this.actionTokens = new ReminderActionTokens(dependencies.index);
    this.loop = new ReminderLoop(dependencies.index, {
      // The daily computation needs only the local routing index and vault;
      // Firebase remains a boundary for identity and email sign-in links.
      preferences: (row) =>
        dependencies.repos.withVault(
          row.accountID,
          row.rootDocumentURL,
          (vault) => vault.getNotificationPreferences(),
        ),
      catalog: (row, now) =>
        dependencies.repos.withVault(
          row.accountID,
          row.rootDocumentURL,
          (vault) => readReminderCatalog(vault, now),
        ),
      send: createReminderDelivery({
        ...dependencies,
        actionTokens: this.actionTokens,
      }),
      logger: dependencies.logger,
    });
  }

  async enroll(subject: string, now = Date.now()) {
    const { accounts, repos, firestore, index } = this.dependencies;
    const account = requireBoundHostedAccount(
      await accounts.getBySubject(subject),
    );
    if (!account.emailAddress)
      throw new Error("Reminder account has no email address");
    // Enrollment is explicit. Import legacy preferences only on the handoff;
    // ordinary restarts and whole-volume restores use the vault and SQLite.
    const legacy =
      account.notificationMode !== "server"
        ? (await firestore.doc(`users/${subject}`).get()).data()
        : undefined;
    const preferences = await repos.withVault(
      account.hostedVaultID,
      account.root.documentURL,
      async (vault) => {
        const saved = await vault.getNotificationPreferences();
        if (saved) return saved;
        const initial: NotificationPreferences = {
          enabled: !(legacy?.isUnsubscribedFromSessionNotifications ?? false),
          snoozedUntilTimestampMillis:
            legacy?.snoozeSessionNotificationsUntilTimestampMillis ?? null,
          localTimeMinutes: 8 * 60,
          timeZone: "America/Los_Angeles",
        };
        await vault.setNotificationPreferences(initial);
        return initial;
      },
    );
    index.register({
      authSubject: subject,
      accountID: account.hostedVaultID,
      rootDocumentURL: account.root.documentURL,
      emailAddress: account.emailAddress,
      nextEvaluation: now,
    });
    // Avoid a second reminder today when handing off from the old worker.
    const lastSent =
      legacy?.sessionNotificationState?.lastNotificationTimestampMillis;
    if (
      lastSent &&
      localReminderTime(lastSent, preferences.timeZone).date ===
        localReminderTime(now, preferences.timeZone).date
    ) {
      index.recordAttempt(
        subject,
        localReminderTime(now, preferences.timeZone).date,
        now,
      );
    }
    // Root preferences and index are durable before disabling the old worker.
    if (account.notificationMode !== "server") {
      await firestore
        .doc(`hostedVaultAccounts/${encodeURIComponent(subject)}`)
        .update({ notificationMode: "server" });
    }
    this.dependencies.logger.event("reminder_enrolled");
  }

  async preferences(subject: string) {
    const account = await this.serverAccount(subject);
    return this.dependencies.repos.withVault(
      account.hostedVaultID,
      account.root.documentURL,
      (vault) => vault.getNotificationPreferences(),
    );
  }

  async update(subject: string, action: ReminderAction, now: number) {
    const account = await this.serverAccount(subject);
    await this.dependencies.repos.withVault(
      account.hostedVaultID,
      account.root.documentURL,
      async (vault) => {
        const saved = await vault.getNotificationPreferences();
        if (!saved) throw new Error("Reminder preferences missing");
        await vault.setNotificationPreferences(
          applyReminderAction(saved, action, now),
        );
      },
    );
    this.dependencies.index.schedule(subject, now);
  }

  start() {
    this.loop.start();
  }
  async stop() {
    await this.loop.stop();
  }
  close() {
    this.dependencies.index.close();
  }

  private async serverAccount(subject: string) {
    const account = requireBoundHostedAccount(
      await this.dependencies.accounts.getBySubject(subject),
    );
    if (account.notificationMode !== "server")
      throw new TypeError("Account not enrolled for server reminders");
    return account;
  }
}
