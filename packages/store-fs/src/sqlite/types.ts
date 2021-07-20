// Consistent SQL database types to unify React Native and Node SQL implementations.
// Adapted from @expo/sqlite, which are in turn adapted from @types/websql.

/*
Notice required by @expo/sqlite's MIT license:

Copyright (c) 2015-present 650 Industries, Inc. (aka Expo)

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

export interface SQLDatabaseCallback {
  (database: SQLDatabase): void;
}

export interface SQLDatabase {
  transaction(
    callback: SQLTransactionCallback,
    errorCallback?: SQLTransactionErrorCallback,
    successCallback?: SQLVoidCallback,
  ): void;

  readTransaction(
    callback: SQLTransactionCallback,
    errorCallback?: SQLTransactionErrorCallback,
    successCallback?: SQLVoidCallback,
  ): void;
}

export interface SQLVoidCallback {
  (): void;
}

export interface SQLTransactionCallback {
  (transaction: SQLTransaction): void;
}

export interface SQLTransactionErrorCallback {
  (error: SQLError): void;
}

export interface SQLTransaction {
  executeSql(
    sqlStatement: string,
    args?: any[],
    callback?: SQLStatementCallback,
    errorCallback?: SQLStatementErrorCallback,
  ): void;
}

export interface SQLStatementCallback {
  (transaction: SQLTransaction, resultSet: SQLResultSet): void;
}

export interface SQLStatementErrorCallback {
  (transaction: SQLTransaction, error: SQLError): boolean;
}

export interface SQLResultSet {
  insertId: number;
  rowsAffected: number;
  rows: SQLResultSetRowList;
}

export interface SQLResultSetRowList {
  length: number;
  item(index: number): any;
}

export declare class SQLError {
  static UNKNOWN_ERR: number;
  static DATABASE_ERR: number;
  static VERSION_ERR: number;
  static TOO_LARGE_ERR: number;
  static QUOTA_ERR: number;
  static SYNTAX_ERR: number;
  static CONSTRAINT_ERR: number;
  static TIMEOUT_ERR: number;

  code: number;
  message: string;
}
