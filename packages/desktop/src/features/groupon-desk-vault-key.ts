// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's kept vault key, lent to the work window.

/**
 * The vault key Groupon Desk and its hand keep in the login keychain, so a fresh window opens the
 * vault without the passphrase being typed again. The item is the one the monorepo's
 * `packages/groupon-cli/src/desk/vault-key.ts` reads and writes: service
 * `com.groupon.desk.vault-key`, account the person's user id, value
 * `<key base64>:<salt base64>:<iterations>`, through `/usr/bin/security`.
 *
 * Responsibilities:
 * - `parseKeptVaultKey`: the keychain value back to its parts (the CLI's `parseStoredKey` rules)
 * - `resolveDeskVaultKey`: the key kept for the person this Mac is signed in as (the user id of
 *   the production entry in the CLI's credentials file), or null
 *
 * Constraints:
 * - Read only: never writes, replaces or deletes the keychain item
 * - Never logs the key; nothing is kept beyond the call
 * - macOS only; any other platform answers null
 * - The renderer still proves the key opens the hub's vault before it keeps it
 */

import { execFile } from "node:child_process";
import {
  deskCredentialsPath,
  PRODUCTION_CORE_URL,
  readDeskSessionEntry,
} from "./groupon-desk-session.js";

export const VAULT_KEY_KEYCHAIN_SERVICE = "com.groupon.desk.vault-key";

/** What the window gets: whose key it is, and the key with the salt and rounds it was made with. */
export interface DeskVaultKey {
  userId: string;
  key: string;
  salt: string;
  iterations: number;
}

/** `security find-generic-password ... -w`: the item's value, or null when there is none. */
export type ReadKeychainItem = (service: string, account: string) => Promise<string | null>;

export interface DeskVaultKeyDeps {
  file: string;
  coreUrl: string;
  platform: NodeJS.Platform;
  readKeychainItem: ReadKeychainItem;
}

/** The user id a Core access token names, read unverified: only to name the keychain account. */
export function userIdOfToken(token: string): string | null {
  try {
    const payload: unknown = JSON.parse(
      Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"),
    );
    if (typeof payload !== "object" || payload === null) return null;
    const { userId, sub } = payload as Record<string, unknown>;
    const id = typeof userId === "string" && userId ? userId : sub;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/** The keychain value back to its parts; null for anything that is not `<key>:<salt>:<n>` in base64. */
export function parseKeptVaultKey(value: string | null): Omit<DeskVaultKey, "userId"> | null {
  if (value === null) return null;
  // `security -w` prints an item stored as bytes in hex; Groupon Desk writes text, but be safe.
  const text =
    /^[0-9a-f]+$/i.test(value) && value.length % 2 === 0 && !value.includes(":")
      ? Buffer.from(value, "hex").toString("utf8")
      : value;
  const parts = text.trim().split(":");
  if (parts.length !== 3) return null;
  const [keyText, saltText, iterationsText] = parts;
  if (!keyText || !saltText || !iterationsText) return null;
  const key = Buffer.from(keyText, "base64");
  const salt = Buffer.from(saltText, "base64");
  const iterations = Number.parseInt(iterationsText, 10);
  if (key.length !== 32 || salt.length === 0 || !Number.isInteger(iterations) || iterations <= 0) {
    return null;
  }
  return { key: key.toString("base64"), salt: salt.toString("base64"), iterations };
}

export async function resolveDeskVaultKey(deps: DeskVaultKeyDeps): Promise<DeskVaultKey | null> {
  if (deps.platform !== "darwin") return null;
  const entry = await readDeskSessionEntry(deps.file, deps.coreUrl);
  const userId = entry ? userIdOfToken(entry.accessToken) : null;
  if (!userId) return null;
  const kept = parseKeptVaultKey(await deps.readKeychainItem(VAULT_KEY_KEYCHAIN_SERVICE, userId));
  return kept ? { userId, ...kept } : null;
}

/** The login keychain through the same command the CLI and Groupon Desk use. */
export const readLoginKeychainItem: ReadKeychainItem = (service, account) =>
  new Promise((resolve) => {
    execFile(
      "/usr/bin/security",
      ["find-generic-password", "-s", service, "-a", account, "-w"],
      { encoding: "utf8", timeout: 10_000 },
      (error, stdout) => resolve(error ? null : stdout.trim() || null),
    );
  });

/** The main process's answer to the window: the key kept for this Mac's production sign-in. */
export function readDeskVaultKeyForWindow(): Promise<DeskVaultKey | null> {
  return resolveDeskVaultKey({
    file: deskCredentialsPath(),
    coreUrl: PRODUCTION_CORE_URL,
    platform: process.platform,
    readKeychainItem: readLoginKeychainItem,
  });
}
