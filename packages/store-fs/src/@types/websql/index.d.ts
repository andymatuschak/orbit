declare module "websql" {
  function openDatabase(
    name: string,
    version: string,
    description: string,
    size: number,
  ): import("../../sqlite/types.js").SQLDatabase;
  export default openDatabase;
}

declare module "websql/custom" {
  namespace customOpenDatabase {
    export interface WebSQLQuery {
      sql: string;
      args: any[];
    }

    export type WebSQLResult =
      | {
          error: Error;
          insertId: undefined;
          rowsAffected: undefined;
          rows: undefined;
        }
      | {
          error: undefined;
          insertId?: number;
          rowsAffected: number;
          rows: unknown[];
        };

    export class WebSQLCustomDatabase {
      constructor(name: string);

      exec(
        queries: WebSQLQuery[],
        readOnly: boolean,
        callback: (err: Error | undefined, results: WebSQLResult[]) => void,
      ): void;
    }
  }
  function customOpenDatabase(
    constructor: typeof customOpenDatabase.WebSQLCustomDatabase,
  ): (
    name: string,
    version: string,
    description: string,
    size: number,
  ) => import("../../sqlite/types.js").SQLDatabase;
  export default customOpenDatabase;
}
