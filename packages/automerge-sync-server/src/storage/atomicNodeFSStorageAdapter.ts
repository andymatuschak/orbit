import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  Chunk,
  StorageAdapterInterface,
  StorageKey,
} from "@automerge/automerge-repo";
const valueFileName = "_value";

export interface NodeFSStorageMetrics {
  loads: number;
  loadRanges: number;
  saves: number;
  removes: number;
  removeRanges: number;
  bytesRead: number;
  bytesWritten: number;
  activeOperations: number;
  maximumActiveOperations: number;
}

/**
 * A read-atomic StorageAdapter for the single-writer private Repo.
 * Values are fsynced to a sibling temporary file and atomically renamed;
 * every key segment is encoded before it becomes a path component.
 */
export class AtomicNodeFSStorageAdapter implements StorageAdapterInterface {
  private readonly limiter: OperationLimiter;
  private mutation: Promise<unknown> = Promise.resolve();
  private closePromise: Promise<void> | null = null;
  private closing = false;
  readonly metrics: NodeFSStorageMetrics = {
    loads: 0,
    loadRanges: 0,
    saves: 0,
    removes: 0,
    removeRanges: 0,
    bytesRead: 0,
    bytesWritten: 0,
    activeOperations: 0,
    maximumActiveOperations: 0,
  };

  constructor(
    readonly baseDirectory: string,
    maximumConcurrency = 32,
  ) {
    this.limiter = new OperationLimiter(maximumConcurrency, this.metrics);
  }

  async load(key: StorageKey): Promise<Uint8Array | undefined> {
    assertStorageKey(key);
    if (this.closing) return undefined;
    this.metrics.loads++;
    return this.limiter.run(async () => {
      try {
        const bytes = await fs.readFile(this.valuePath(key));
        this.metrics.bytesRead += bytes.byteLength;
        return new Uint8Array(bytes);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
    });
  }

  async save(key: StorageKey, binary: Uint8Array): Promise<void> {
    assertStorageKey(key);
    if (this.closing) return;
    await this.exclusiveMutation(async () => {
      this.metrics.saves++;
      await this.limiter.run(async () => {
        const valuePath = this.valuePath(key);
        const directory = path.dirname(valuePath);
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const temporaryPath = path.join(
          directory,
          `.pending-${process.pid}-${randomUUID()}`,
        );
        const file = await fs.open(temporaryPath, "wx", 0o600);
        try {
          await file.writeFile(binary);
          await file.sync();
        } catch (error) {
          await file.close();
          await fs.rm(temporaryPath, { force: true });
          throw error;
        }
        await file.close();
        await fs.rename(temporaryPath, valuePath);
        await syncDirectory(directory);
        this.metrics.bytesWritten += binary.byteLength;
      });
    });
  }

  async remove(key: StorageKey): Promise<void> {
    assertStorageKey(key);
    if (this.closing) return;
    this.metrics.removes++;
    await this.exclusiveMutation(async () => {
      await this.limiter.run(async () => {
        const valuePath = this.valuePath(key);
        try {
          await fs.unlink(valuePath);
          await syncDirectory(path.dirname(valuePath));
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      });
    });
  }

  async loadRange(prefix: StorageKey): Promise<Chunk[]> {
    assertStorageKey(prefix, true);
    if (this.closing) return [];
    this.metrics.loadRanges++;
    const valuePaths = await this.walkValuePaths(this.keyDirectory(prefix));
    const chunks = await Promise.all(
      valuePaths.map((valuePath) =>
        this.limiter.run(async () => {
          const bytes = await fs.readFile(valuePath);
          this.metrics.bytesRead += bytes.byteLength;
          return {
            key: this.decodeValuePath(valuePath),
            data: new Uint8Array(bytes),
          } satisfies Chunk;
        }),
      ),
    );
    return chunks.sort((left, right) =>
      JSON.stringify(left.key).localeCompare(JSON.stringify(right.key)),
    );
  }

  async removeRange(prefix: StorageKey): Promise<void> {
    // Repo always removes a document/chunk prefix. Refuse an empty prefix so a
    // malformed message can never erase the entire Repo.
    assertStorageKey(prefix);
    if (this.closing) return;
    this.metrics.removeRanges++;
    await this.exclusiveMutation(async () => {
      await this.limiter.run(async () => {
        await fs.rm(this.keyDirectory(prefix), {
          recursive: true,
          force: true,
        });
        await syncDirectory(path.dirname(this.keyDirectory(prefix)));
      });
    });
  }

  async close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = this.drainForClose();
    return this.closePromise;
  }

  private async drainForClose(): Promise<void> {
    // Repo may enqueue final sync-state writes while disconnecting its network.
    // A storage close is the volume-unmount boundary, so do not return until
    // every queued mutation and concurrent read has actually released the FS.
    for (;;) {
      const pendingMutation = this.mutation;
      await pendingMutation;
      await this.limiter.whenIdle();
      if (pendingMutation === this.mutation) return;
    }
  }

  private async walkValuePaths(directory: string): Promise<string[]> {
    let entries: Dirent[];
    try {
      entries = await this.limiter.run(() =>
        fs.readdir(directory, { withFileTypes: true }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const children = await Promise.all(
      entries.map(async (entry) => {
        const child = path.join(directory, entry.name);
        if (entry.isDirectory()) return this.walkValuePaths(child);
        if (entry.isFile() && entry.name === valueFileName) return [child];
        // A process killed before rename can leave only a pending file. It was
        // never committed and is deliberately ignored during recovery.
        return [];
      }),
    );
    return children.flat();
  }

  private valuePath(key: StorageKey) {
    return path.join(this.keyDirectory(key), valueFileName);
  }

  private keyDirectory(key: StorageKey) {
    return path.join(this.baseDirectory, ...key.map(encodeKeySegment));
  }

  private decodeValuePath(valuePath: string): StorageKey {
    const relative = path.relative(this.baseDirectory, path.dirname(valuePath));
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Storage path escaped the Repo directory");
    }
    return relative.split(path.sep).filter(Boolean).map(decodeKeySegment);
  }

  private exclusiveMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutation.then(operation, operation);
    this.mutation = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

class OperationLimiter {
  private active = 0;
  private pending = 0;
  private readonly waiters: (() => void)[] = [];
  private readonly idleWaiters: (() => void)[] = [];

  constructor(
    private readonly maximum: number,
    private readonly metrics: NodeFSStorageMetrics,
  ) {
    if (!Number.isSafeInteger(maximum) || maximum < 1) {
      throw new Error("Storage concurrency must be a positive integer");
    }
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    this.pending++;
    if (this.active >= this.maximum) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    this.metrics.activeOperations = this.active;
    this.metrics.maximumActiveOperations = Math.max(
      this.metrics.maximumActiveOperations,
      this.active,
    );
    try {
      return await operation();
    } finally {
      this.active--;
      this.pending--;
      this.metrics.activeOperations = this.active;
      this.waiters.shift()?.();
      if (this.pending === 0) {
        for (const resolve of this.idleWaiters.splice(0)) resolve();
      }
    }
  }

  whenIdle(): Promise<void> {
    return this.pending === 0
      ? Promise.resolve()
      : new Promise((resolve) => this.idleWaiters.push(resolve));
  }
}

function encodeKeySegment(segment: string) {
  return `k-${Buffer.from(segment, "utf8").toString("base64url")}`;
}

function decodeKeySegment(segment: string) {
  if (!segment.startsWith("k-")) {
    throw new Error("Malformed encoded storage key");
  }
  return Buffer.from(segment.slice(2), "base64url").toString("utf8");
}

function assertStorageKey(
  value: StorageKey,
  allowEmpty = false,
): asserts value is StorageKey {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((segment) => typeof segment !== "string")
  ) {
    throw new Error("Invalid Automerge storage key");
  }
}

async function syncDirectory(directory: string) {
  try {
    const handle = await fs.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    // Some non-POSIX development filesystems do not permit directory fsync.
    if (
      !["EINVAL", "ENOTSUP", "EBADF"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
    ) {
      throw error;
    }
  }
}
