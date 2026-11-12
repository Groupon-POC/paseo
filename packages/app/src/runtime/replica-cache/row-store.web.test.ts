import {
  IDBKeyRange as FakeIDBKeyRange,
  IDBObjectStore as FakeIDBObjectStore,
  indexedDB as fakeIndexedDb,
} from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { runReplicaRowStoreContract } from "./row-store.contract";
import { createIndexedDbReplicaRowStore } from "./row-store.web";

globalThis.indexedDB = fakeIndexedDb;
globalThis.IDBKeyRange = FakeIDBKeyRange;

let databaseSequence = 0;

runReplicaRowStoreContract("IndexedDB", async () => {
  const databaseName = `replica-row-store-test-${databaseSequence++}`;
  return {
    store: createIndexedDbReplicaRowStore({ databaseName, schemaVersion: 1 }),
    async openWithSchemaVersion(schemaVersion) {
      const store = createIndexedDbReplicaRowStore({ databaseName, schemaVersion });
      await store.open();
      return store;
    },
  };
});

it("uses exact IndexedDB keys for targeted rows instead of scanning the host", async () => {
  const store = createIndexedDbReplicaRowStore({
    databaseName: `replica-row-store-targeted-${databaseSequence++}`,
    schemaVersion: 1,
  });
  await store.open();
  await store.apply({
    upserts: [
      { serverId: "server-a", kind: "agent", id: "agent-1", payload: "agent" },
      { serverId: "server-a", kind: "workspace", id: "workspace-1", payload: "workspace" },
    ],
    deletes: [],
  });
  const get = vi.spyOn(FakeIDBObjectStore.prototype, "get");
  const getAll = vi.spyOn(FakeIDBObjectStore.prototype, "getAll");

  expect(await store.read("server-a", ["agent"], ["agent-1"])).toEqual([
    { serverId: "server-a", kind: "agent", id: "agent-1", payload: "agent" },
  ]);
  expect(get).toHaveBeenCalledWith(["server-a", "agent", "agent-1"]);
  expect(getAll).not.toHaveBeenCalled();

  get.mockRestore();
  getAll.mockRestore();
});

describe("a read whose transaction aborts", () => {
  async function abortedRead(
    read: (store: ReturnType<typeof createIndexedDbReplicaRowStore>) => Promise<unknown>,
  ) {
    const store = createIndexedDbReplicaRowStore({
      databaseName: `replica-row-store-aborted-${databaseSequence++}`,
      schemaVersion: 1,
    });
    await store.open();
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", onUnhandled);
    const getAll = vi
      .spyOn(FakeIDBObjectStore.prototype, "getAll")
      .mockImplementationOnce(function (this: IDBObjectStore, ...args) {
        const request = FakeIDBObjectStore.prototype.getAll.call(this, ...args);
        this.transaction.abort();
        return request;
      });
    try {
      await expect(read(store)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      return unhandled;
    } finally {
      process.off("unhandledRejection", onUnhandled);
      getAll.mockRestore();
    }
  }

  it("readAll rejects and leaves no unhandled rejection", async () => {
    expect(await abortedRead((store) => store.readAll())).toEqual([]);
  });

  it("read rejects and leaves no unhandled rejection", async () => {
    expect(await abortedRead((store) => store.read("server-a", ["agent"]))).toEqual([]);
  });
});
