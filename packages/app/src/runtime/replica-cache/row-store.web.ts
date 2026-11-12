// Changed for Groupon Desk (fork of Paseo, Apache-2.0): a read whose transaction fails or aborts settles its completion promise too, so no rejection goes unhandled (Sentry FRONTEND-DESK-TS-3).
import type { ReplicaHostRows, ReplicaRow, ReplicaRowChanges, ReplicaRowStore } from "./row-store";
import { REPLICA_ROW_STORE_SCHEMA_VERSION } from "./row-store-schema";

export type {
  ReplicaHostRows,
  ReplicaRow,
  ReplicaRowChanges,
  ReplicaRowKey,
  ReplicaRowKind,
  ReplicaRowStore,
} from "./row-store";
export { REPLICA_ROW_STORE_SCHEMA_VERSION, REPLICA_SINGLETON_ROW_ID } from "./row-store-schema";

const DATABASE_NAME = "paseo-replica-row-store";
const DATABASE_VERSION = 1;
const ROWS_STORE = "rows";
const META_STORE = "meta";
const SCHEMA_VERSION_KEY = "schema_version";

interface IndexedDbReplicaRowStoreOptions {
  databaseName: string;
  schemaVersion: number;
}

function requestResult<Result>(request: IDBRequest<Result>): Promise<Result> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Replica row store request failed")),
    );
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("Replica row store transaction was aborted")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("Replica row store transaction failed")),
    );
  });
}

async function withTransaction<Result>(
  database: IDBDatabase,
  storeNames: string | string[],
  mode: IDBTransactionMode,
  operation: (transaction: IDBTransaction) => Promise<Result>,
): Promise<Result> {
  const transaction = database.transaction(storeNames, mode);
  const completion = transactionComplete(transaction);
  try {
    const result = await operation(transaction);
    await completion;
    return result;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      // The transaction already aborted after the failed request.
    }
    await completion.catch(() => undefined);
    throw error;
  }
}

function runTransaction(
  database: IDBDatabase,
  storeNames: string | string[],
  operation: (transaction: IDBTransaction) => Promise<void>,
): Promise<void> {
  return withTransaction(database, storeNames, "readwrite", operation);
}

async function openDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(ROWS_STORE)) {
        request.result.createObjectStore(ROWS_STORE, { keyPath: ["serverId", "kind", "id"] });
      }
      if (!request.result.objectStoreNames.contains(META_STORE)) {
        request.result.createObjectStore(META_STORE);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("Failed to open replica row store")),
    );
    request.addEventListener("blocked", () =>
      reject(new Error("Replica row store database open was blocked")),
    );
  });
}

/** @package Test seam for exercising the browser engine with an isolated database. */
export function createIndexedDbReplicaRowStore(
  options: IndexedDbReplicaRowStoreOptions,
): ReplicaRowStore {
  let database: IDBDatabase | null = null;
  let opening: Promise<void> | null = null;

  function getDatabase(): IDBDatabase {
    if (!database) throw new Error("Replica row store has not been opened");
    return database;
  }

  async function open(): Promise<void> {
    opening ??= (async () => {
      const openedDatabase = await openDatabase(options.databaseName);
      await runTransaction(openedDatabase, [ROWS_STORE, META_STORE], async (transaction) => {
        const storedVersion = await requestResult(
          transaction.objectStore(META_STORE).get(SCHEMA_VERSION_KEY),
        );
        if (storedVersion !== options.schemaVersion) {
          await requestResult(transaction.objectStore(ROWS_STORE).clear());
          await requestResult(
            transaction.objectStore(META_STORE).put(options.schemaVersion, SCHEMA_VERSION_KEY),
          );
        }
      });
      database = openedDatabase;
    })();

    try {
      await opening;
    } catch (error) {
      opening = null;
      throw error;
    }
  }

  async function readAll(): Promise<ReplicaHostRows[]> {
    const rows = await withTransaction(getDatabase(), ROWS_STORE, "readonly", (transaction) =>
      requestResult<ReplicaRow[]>(transaction.objectStore(ROWS_STORE).getAll()),
    );
    const hosts = new Map<string, ReplicaRow[]>();
    for (const row of rows) {
      const hostRows = hosts.get(row.serverId) ?? [];
      hostRows.push(row);
      hosts.set(row.serverId, hostRows);
    }
    return Array.from(hosts, ([serverId, hostRows]) => ({ serverId, rows: hostRows }));
  }

  async function read(
    serverId: string,
    kinds: readonly ReplicaRow["kind"][],
    ids?: readonly string[],
  ): Promise<ReplicaRow[]> {
    if (kinds.length === 0 || ids?.length === 0) return [];
    const rows = await withTransaction(
      getDatabase(),
      ROWS_STORE,
      "readonly",
      async (transaction) => {
        const store = transaction.objectStore(ROWS_STORE);
        const requests = ids
          ? kinds.flatMap((kind) =>
              ids.map(async (id) => {
                const row = await requestResult<ReplicaRow | undefined>(
                  store.get([serverId, kind, id]),
                );
                return row ? [row] : [];
              }),
            )
          : kinds.map((kind) =>
              requestResult<ReplicaRow[]>(
                store.getAll(IDBKeyRange.bound([serverId, kind], [serverId, kind, []])),
              ),
            );
        return (await Promise.all(requests)).flat();
      },
    );
    return rows.sort((left, right) =>
      left.kind === right.kind
        ? left.id.localeCompare(right.id)
        : left.kind.localeCompare(right.kind),
    );
  }

  async function apply(changes: ReplicaRowChanges): Promise<void> {
    await runTransaction(getDatabase(), ROWS_STORE, async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      for (const key of changes.deletes) {
        await requestResult(rows.delete([key.serverId, key.kind, key.id]));
      }
      for (const row of changes.upserts) {
        await requestResult(rows.put(row));
      }
    });
  }

  async function deleteHost(serverId: string): Promise<void> {
    await runTransaction(getDatabase(), ROWS_STORE, async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      const range = IDBKeyRange.bound([serverId], [serverId, []]);
      await requestResult(rows.delete(range));
    });
  }

  async function renameHost(oldServerId: string, newServerId: string): Promise<void> {
    if (oldServerId === newServerId) return;
    await runTransaction(getDatabase(), ROWS_STORE, async (transaction) => {
      const rows = transaction.objectStore(ROWS_STORE);
      const range = IDBKeyRange.bound([oldServerId], [oldServerId, []]);
      const oldRows = await requestResult<ReplicaRow[]>(rows.getAll(range));
      for (const row of oldRows) {
        await requestResult(rows.put({ ...row, serverId: newServerId }));
        await requestResult(rows.delete([row.serverId, row.kind, row.id]));
      }
    });
  }

  async function clear(): Promise<void> {
    await runTransaction(getDatabase(), ROWS_STORE, async (transaction) => {
      await requestResult(transaction.objectStore(ROWS_STORE).clear());
    });
  }

  return { open, read, readAll, apply, deleteHost, renameHost, clear };
}

export function createReplicaRowStore(): ReplicaRowStore {
  return createIndexedDbReplicaRowStore({
    databaseName: DATABASE_NAME,
    schemaVersion: REPLICA_ROW_STORE_SCHEMA_VERSION,
  });
}
