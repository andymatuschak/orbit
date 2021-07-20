import { SQLDatabase, SQLResultSet, SQLTransactionCallback } from "./types";

// Convert callback-style transaction API to promises.
export function execTransaction(
  db: SQLDatabase,
  continuation: SQLTransactionCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.transaction(continuation, reject, resolve);
  });
}

export function execReadTransaction(
  db: SQLDatabase,
  continuation: SQLTransactionCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    db.readTransaction(continuation, reject, resolve);
  });
}

// Convenience method for executing a single statement in a read transaction.
export async function execReadStatement(
  db: SQLDatabase,
  sqlStatement: string,
  args?: any[],
): Promise<SQLResultSet> {
  let resultSet: SQLResultSet | null = null;
  await execReadTransaction(db, (tx) => {
    tx.executeSql(
      sqlStatement,
      args,
      (transaction, _resultSet) => {
        resultSet = _resultSet;
      },
      (transaction, error) => {
        console.error(error);
        throw error;
      },
    );
  });

  if (!resultSet) {
    throw new Error("Should be unreachable");
  }
  return resultSet;
}
