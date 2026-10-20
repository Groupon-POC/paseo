// Added for Groupon Desk (fork of Paseo, Apache-2.0): the web build's stand-in for the keychain.

/**
 * A browser has no keychain, so the web build keeps the session and the vault key encrypted:
 * AES-GCM under a device key that WebCrypto made non-extractable and IndexedDB holds. Script on
 * this origin can ask the browser to decrypt with it, but no script, extension page or copied
 * profile file can read the key's bytes out; what sits in localStorage is ciphertext only.
 *
 * Responsibilities:
 * - one device key per origin, made once and kept (the first tab to store it wins; a racing tab
 *   adopts it), and a request that the browser keep this origin's storage (`storage.persist`)
 * - each value sealed with a fresh IV and its own storage name as associated data, so a value
 *   cannot be moved to another name
 * - a value an older build left in plain text is sealed in place on first read, so nobody types
 *   the passphrase again after an update
 *
 * Constraints:
 * - The device key is generated with extractable false and is never exported or logged
 * - A value that does not open (the device key was cleared, a tampered entry) reads as absent and
 *   is removed: the person signs in or types the passphrase again, never sees a crash
 * - Without IndexedDB nothing is kept beyond the page (a memory map): never a plain-text fallback
 */

import { base64ToBytes, bytesToBase64 } from "./crypto";

/** Where the sealed values live: localStorage in the app, a map in the tests. */
export interface SecretTextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Gives the one device key, making and keeping it on first use; null when it cannot be kept. */
export type DeviceKeySource = () => Promise<CryptoKey | null>;

export interface WebSecretStore {
  readSecret(key: string): Promise<string | null>;
  writeSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
}

/** A sealed value: this prefix, the IV and the ciphertext with its tag, each in base64. */
const SEALED_PREFIX = "gdw1.";
const IV_BYTES = 12;
const DATABASE_NAME = "groupon-desk-keys";
const STORE_NAME = "keys";
const DEVICE_KEY_ID = "device-key";

function newDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]) as Promise<CryptoKey>;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  const request = factory.open(name, 1);
  request.addEventListener("upgradeneeded", () => {
    if (!request.result.objectStoreNames.contains(STORE_NAME)) {
      request.result.createObjectStore(STORE_NAME);
    }
  });
  return requestResult(request);
}

/**
 * Reads the device key, or keeps `candidate` as it in one readwrite transaction, so two tabs
 * starting at once agree on one key (IndexedDB serialises their transactions on the store).
 */
function keepOrAdopt(database: IDBDatabase, candidate: CryptoKey): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const keys = transaction.objectStore(STORE_NAME);
    let kept: CryptoKey = candidate;
    const read = keys.get(DEVICE_KEY_ID);
    read.addEventListener("success", () => {
      if (read.result instanceof CryptoKey) kept = read.result;
      else keys.add(candidate, DEVICE_KEY_ID);
    });
    transaction.addEventListener("complete", () => resolve(kept));
    transaction.addEventListener("error", () => reject(transaction.error));
    transaction.addEventListener("abort", () => reject(transaction.error));
  });
}

/** The device key in IndexedDB; null (with a warning) when this browser gives no IndexedDB. */
export function indexedDbDeviceKey(
  factory: IDBFactory | undefined,
  databaseName: string = DATABASE_NAME,
): DeviceKeySource {
  let pending: Promise<CryptoKey | null> | null = null;
  return () => {
    pending ??= (async () => {
      if (!factory) return null;
      try {
        const database = await openDatabase(factory, databaseName);
        try {
          const existing = await requestResult(
            database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(DEVICE_KEY_ID),
          );
          if (existing instanceof CryptoKey) return existing;
          // The key is made outside the transaction: awaiting WebCrypto inside one ends it.
          return await keepOrAdopt(database, await newDeviceKey());
        } finally {
          database.close();
        }
      } catch (error) {
        console.warn("[groupon] no IndexedDB for the device key; nothing is kept past this page", {
          error: error instanceof Error ? error.name : String(error),
        });
        return null;
      }
    })();
    return pending;
  };
}

async function seal(deviceKey: CryptoKey, name: string, value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
    deviceKey,
    new TextEncoder().encode(value),
  );
  return `${SEALED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(sealed))}`;
}

/** The plain value, or null when the entry does not open with this device key under this name. */
async function unseal(deviceKey: CryptoKey, name: string, stored: string): Promise<string | null> {
  const [iv, sealed] = stored.slice(SEALED_PREFIX.length).split(".");
  if (!iv || !sealed) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(base64ToBytes(iv)),
        additionalData: new TextEncoder().encode(name),
      },
      deviceKey,
      new Uint8Array(base64ToBytes(sealed)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function createWebSecretStore(deps: {
  storage: SecretTextStorage | undefined;
  deviceKey: DeviceKeySource;
}): WebSecretStore {
  const { storage, deviceKey } = deps;
  // Without a device key the values live as long as the page, never in plain text on disk.
  const memory = new Map<string, string>();

  async function write(key: string, value: string): Promise<void> {
    const device = await deviceKey();
    if (!device || !storage) {
      memory.set(key, value);
      return;
    }
    storage.setItem(key, await seal(device, key, value));
  }

  async function read(key: string): Promise<string | null> {
    const device = await deviceKey();
    if (!device || !storage) return memory.get(key) ?? null;
    const stored = storage.getItem(key);
    if (stored === null) return null;
    if (!stored.startsWith(SEALED_PREFIX)) {
      // An older build kept it in plain text: seal it in place and go on with it.
      await write(key, stored);
      return stored;
    }
    const value = await unseal(device, key, stored);
    if (value === null) storage.removeItem(key);
    return value;
  }

  async function remove(key: string): Promise<void> {
    memory.delete(key);
    storage?.removeItem(key);
  }

  return { readSecret: read, writeSecret: write, deleteSecret: remove };
}

let theStore: WebSecretStore | null = null;

function defaultStore(): WebSecretStore {
  if (!theStore) {
    theStore = createWebSecretStore({
      storage: globalThis.localStorage,
      deviceKey: indexedDbDeviceKey(globalThis.indexedDB),
    });
    // Ask the browser not to evict this origin's storage under pressure, so the vault key lasts.
    void globalThis.navigator?.storage?.persist?.().catch(() => false);
  }
  return theStore;
}

export function readSecret(key: string): Promise<string | null> {
  return defaultStore().readSecret(key);
}

export function writeSecret(key: string, value: string): Promise<void> {
  return defaultStore().writeSecret(key, value);
}

export function deleteSecret(key: string): Promise<void> {
  return defaultStore().deleteSecret(key);
}
