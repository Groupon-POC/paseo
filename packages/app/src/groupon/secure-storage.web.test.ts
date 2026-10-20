// Added for Groupon Desk (fork of Paseo, Apache-2.0): the web build's sealed secrets.
/**
 * Tests for the web build's keychain stand-in: values sealed under a non-extractable device key
 * kept in IndexedDB (fake-indexeddb here), never in plain text.
 *
 * Covers: packages/app/src/groupon/secure-storage.web.ts
 */
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  createWebSecretStore,
  indexedDbDeviceKey,
  type SecretTextStorage,
} from "./secure-storage.web";

class MemoryStorage implements SecretTextStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const VAULT = "groupon-desk.vault-key";
const VALUE = JSON.stringify({ coreUrl: "https://api-core.livingsocial.com", key: "c2VjcmV0" });

function setup(factory: IDBFactory = new IDBFactory(), storage = new MemoryStorage()) {
  const deviceKey = indexedDbDeviceKey(factory, "test-keys");
  return { factory, storage, deviceKey, store: createWebSecretStore({ storage, deviceKey }) };
}

describe("the web build's secret store", () => {
  it("keeps the value sealed in storage and reads it back", async () => {
    const { storage, store } = setup();
    await store.writeSecret(VAULT, VALUE);
    const stored = storage.getItem(VAULT) ?? "";
    expect(stored.startsWith("gdw1.")).toBe(true);
    expect(stored).not.toContain("c2VjcmV0");
    expect(stored).not.toContain("api-core");
    expect(await store.readSecret(VAULT)).toBe(VALUE);
  });

  it("makes a non-extractable AES-GCM device key and keeps one across page loads", async () => {
    const factory = new IDBFactory();
    const storage = new MemoryStorage();
    const first = setup(factory, storage);
    await first.store.writeSecret(VAULT, VALUE);
    const key = await first.deviceKey();
    expect(key?.extractable).toBe(false);
    expect(key?.algorithm.name).toBe("AES-GCM");
    await expect(crypto.subtle.exportKey("raw", key as CryptoKey)).rejects.toThrow();

    // A new page load: a fresh store over the same IndexedDB and localStorage opens the value.
    const reloaded = setup(factory, storage);
    expect(await reloaded.store.readSecret(VAULT)).toBe(VALUE);
  });

  it("two tabs starting at once agree on one device key", async () => {
    const factory = new IDBFactory();
    const [a, b] = await Promise.all([
      indexedDbDeviceKey(factory, "test-keys")(),
      indexedDbDeviceKey(factory, "test-keys")(),
    ]);
    const storage = new MemoryStorage();
    await createWebSecretStore({ storage, deviceKey: async () => a }).writeSecret(VAULT, VALUE);
    expect(
      await createWebSecretStore({ storage, deviceKey: async () => b }).readSecret(VAULT),
    ).toBe(VALUE);
  });

  it("seals a value an older build left in plain text, in place, and keeps it", async () => {
    const storage = new MemoryStorage();
    storage.setItem(VAULT, VALUE);
    const { store } = setup(new IDBFactory(), storage);
    expect(await store.readSecret(VAULT)).toBe(VALUE);
    expect(storage.getItem(VAULT)?.startsWith("gdw1.")).toBe(true);
    expect(await store.readSecret(VAULT)).toBe(VALUE);
  });

  it("a value moved to another name does not open there", async () => {
    const { storage, store } = setup();
    await store.writeSecret(VAULT, VALUE);
    storage.setItem("groupon-desk.session", storage.getItem(VAULT) ?? "");
    expect(await store.readSecret("groupon-desk.session")).toBeNull();
    expect(storage.getItem("groupon-desk.session")).toBeNull();
  });

  it("reads as absent, and drops the entry, once the device key is gone", async () => {
    const storage = new MemoryStorage();
    await setup(new IDBFactory(), storage).store.writeSecret(VAULT, VALUE);
    // Site data cleared for IndexedDB alone: a new device key cannot open the old value.
    const { store } = setup(new IDBFactory(), storage);
    expect(await store.readSecret(VAULT)).toBeNull();
    expect(storage.getItem(VAULT)).toBeNull();
  });

  it("deletes a value", async () => {
    const { storage, store } = setup();
    await store.writeSecret(VAULT, VALUE);
    await store.deleteSecret(VAULT);
    expect(storage.getItem(VAULT)).toBeNull();
    expect(await store.readSecret(VAULT)).toBeNull();
  });

  it("without IndexedDB keeps the value for this page only, never in plain text", async () => {
    const storage = new MemoryStorage();
    const store = createWebSecretStore({ storage, deviceKey: indexedDbDeviceKey(undefined) });
    await store.writeSecret(VAULT, VALUE);
    expect(storage.items.size).toBe(0);
    expect(await store.readSecret(VAULT)).toBe(VALUE);
  });
});
