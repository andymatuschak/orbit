import { DatabaseSync } from "node:sqlite";

export interface ReminderAccount {
  authSubject: string;
  accountID: string;
  rootDocumentURL: string;
  emailAddress: string;
  nextEvaluation: number;
  lastAttemptDate: string | null;
  attemptCount: number;
  catalogFingerprint: string | null;
}

/** Operational metadata only; preferences and due dates belong to the vault. */
export class ReminderIndex {
  private readonly database: DatabaseSync;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS reminder_accounts (
        authSubject TEXT PRIMARY KEY, accountID TEXT NOT NULL,
        rootDocumentURL TEXT NOT NULL, emailAddress TEXT NOT NULL,
        nextEvaluation INTEGER NOT NULL, lastAttemptDate TEXT,
        attemptCount INTEGER NOT NULL DEFAULT 0, catalogFingerprint TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS reminder_due ON reminder_accounts(nextEvaluation);
      CREATE TABLE IF NOT EXISTS reminder_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    `);
  }

  register(
    account: Omit<
      ReminderAccount,
      "lastAttemptDate" | "attemptCount" | "catalogFingerprint"
    >,
  ) {
    this.database
      .prepare(
        `INSERT INTO reminder_accounts (authSubject, accountID, rootDocumentURL, emailAddress, nextEvaluation)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(authSubject) DO UPDATE SET accountID=excluded.accountID,
        rootDocumentURL=excluded.rootDocumentURL, emailAddress=excluded.emailAddress
    `,
      )
      .run(
        account.authSubject,
        account.accountID,
        account.rootDocumentURL,
        account.emailAddress,
        account.nextEvaluation,
      );
  }

  /** Task activity or an empty queue starts a new sequence, not a new day. */
  observeCatalog(subject: string, fingerprint: string, hasDueReviews: boolean) {
    const row = this.database
      .prepare(
        `
      UPDATE reminder_accounts SET
        attemptCount=CASE WHEN ?=0 OR (catalogFingerprint IS NOT NULL AND catalogFingerprint<>?)
          THEN 0 ELSE attemptCount END,
        catalogFingerprint=?
      WHERE authSubject=? RETURNING attemptCount
    `,
      )
      .get(Number(hasDueReviews), fingerprint, fingerprint, subject);
    if (!row) throw new Error("Reminder account missing");
    return row.attemptCount as number;
  }

  due(now: number): ReminderAccount[] {
    return this.database
      .prepare(
        "SELECT * FROM reminder_accounts WHERE nextEvaluation <= ? ORDER BY nextEvaluation",
      )
      .all(now) as unknown as ReminderAccount[];
  }

  schedule(subject: string, nextEvaluation: number) {
    this.database
      .prepare(
        "UPDATE reminder_accounts SET nextEvaluation=? WHERE authSubject=?",
      )
      .run(nextEvaluation, subject);
  }

  /** Commit before sending. A crash/ambiguous response consumes this day. */
  recordAttempt(subject: string, localDate: string, nextEvaluation: number) {
    return (
      this.database
        .prepare(
          `UPDATE reminder_accounts SET lastAttemptDate=?, nextEvaluation=?, attemptCount=attemptCount+1
      WHERE authSubject=? AND (lastAttemptDate IS NULL OR lastAttemptDate<>?)
    `,
        )
        .run(localDate, nextEvaluation, subject, localDate).changes === 1
    );
  }

  secret(create: () => string) {
    const existing = this.database
      .prepare("SELECT value FROM reminder_metadata WHERE key='action-secret'")
      .get();
    if (existing) return existing.value as string;
    const value = create();
    this.database
      .prepare("INSERT INTO reminder_metadata VALUES ('action-secret', ?)")
      .run(value);
    return value;
  }

  close() {
    this.database.close();
  }
}
