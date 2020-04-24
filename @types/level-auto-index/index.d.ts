declare module "level-auto-index" {
  import { LevelUp } from "levelup";
  function AutoIndex<T>(
    db: LevelUp,
    idb: LevelUp,
    reduce: (value: T) => string,
    opts: unknown,
  ): AutoIndex.IndexedDB;

  export = AutoIndex;
  namespace AutoIndex {
    interface IndexedDB {
      get(key: string, opts: unknown): Promise<unknown>;
    }
  }
}
