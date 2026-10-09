import type { NotificationPreferences } from "@withorbit/core";
import type { ServiceLogger } from "../logging/safeLogger.js";
import { ReminderIndex, type ReminderAccount } from "./reminderIndex.js";
import {
  localReminderTime,
  nextReminderEvaluation,
  reminderBackoffAllowsAttempt,
} from "./reminderSchedule.js";

export class ReminderLoop {
  private operation: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly index: ReminderIndex,
    private readonly dependencies: {
      preferences(
        account: ReminderAccount,
      ): Promise<NotificationPreferences | undefined>;
      catalog(
        account: ReminderAccount,
        now: number,
      ): Promise<{ due: number; fingerprint: string }>;
      send(account: ReminderAccount, now: number): Promise<void>;
      logger: ServiceLogger;
    },
  ) {}

  start() {
    if (this.timer) throw new Error("Reminder loop already started");
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
    void this.tick();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.operation;
  }

  tick(now = Date.now()): Promise<void> {
    // One process, one loop; overlapping ticks have no second worker.
    if (this.operation) return this.operation;
    this.operation = this.evaluate(now).finally(() => {
      this.operation = null;
    });
    return this.operation;
  }

  private async evaluate(now: number) {
    for (const account of this.index.due(now)) {
      let attemptRecorded = false;
      try {
        const preferences = await this.dependencies.preferences(account);
        if (!preferences?.enabled) {
          this.index.schedule(account.authSubject, now + 24 * 60 * 60_000);
          continue;
        }
        const local = localReminderTime(now, preferences.timeZone);
        const eligibleAt = nextReminderEvaluation(
          now,
          preferences,
          account.lastAttemptDate,
        );
        if (eligibleAt > now) {
          this.index.schedule(account.authSubject, eligibleAt);
          continue;
        }
        const { due, fingerprint } = await this.dependencies.catalog(
          account,
          now,
        );
        const attemptCount = this.index.observeCatalog(
          account.authSubject,
          fingerprint,
          due > 0,
        );
        const next = nextReminderEvaluation(now, preferences, local.date);
        if (!due) {
          this.index.schedule(account.authSubject, next);
          this.dependencies.logger.event("reminder_evaluated", { due: 0 });
          continue;
        }
        // Keep the cheap daily catalog check even while backed off/stopped:
        // task activity can restart the sequence without another client signal.
        if (
          !reminderBackoffAllowsAttempt(
            local.date,
            account.lastAttemptDate,
            attemptCount,
          )
        ) {
          this.index.schedule(account.authSubject, next);
          continue;
        }
        if (!this.index.recordAttempt(account.authSubject, local.date, next))
          continue;
        attemptRecorded = true;
        await this.dependencies.send(account, now);
        this.dependencies.logger.event("reminder_sent", { due });
      } catch (error) {
        // Storage/auth failures can retry soon. A recorded delivery attempt
        // already has tomorrow's deadline, even if the response was lost.
        if (!attemptRecorded)
          this.index.schedule(account.authSubject, now + 5 * 60_000);
        this.dependencies.logger.error("reminder_evaluation_failed", error);
      }
    }
  }
}
