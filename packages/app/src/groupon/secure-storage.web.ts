// Added for Groupon Desk (fork of Paseo, Apache-2.0): the web build's stand-in for the keychain.

/**
 * A browser has no keychain: the session and the vault key sit in this origin's localStorage,
 * readable by any script on the origin. Good enough for a local development build; a hosted web
 * build needs a better home (a non-extractable WebCrypto key in IndexedDB) before it ships.
 */
export async function readSecret(key: string): Promise<string | null> {
  return globalThis.localStorage?.getItem(key) ?? null;
}

export async function writeSecret(key: string, value: string): Promise<void> {
  globalThis.localStorage?.setItem(key, value);
}

export async function deleteSecret(key: string): Promise<void> {
  globalThis.localStorage?.removeItem(key);
}
