// Added for Groupon Desk (fork of Paseo, Apache-2.0): this Mac's Groupon sign-in, lent to the work window.

/**
 * The sign-in Groupon Desk and the `groupon` CLI already hold on this Mac, read from the CLI's
 * credentials file (`$XDG_CONFIG_HOME/groupon/credentials`, else `~/.config/groupon/credentials`;
 * the monorepo's `packages/groupon-cli/src/auth/storage.ts`), so the window opens signed in instead
 * of asking for Google again.
 *
 * Responsibilities:
 * - `readDeskSessionEntry`: the production entry of the file (`type: "session"`), or null when the
 *   file is missing, malformed, of another version, or has no such entry
 * - `resolveDeskSession`: an access token good for at least `freshForMs`; when the file's is not,
 *   renewed against Core under the CLI's own lock (`credentials.refresh.lock`) and written back in
 *   the CLI's format, the way `resolveSessionCredential` does, so the CLI, the hand and the window
 *   keep one sign-in
 *
 * Constraints:
 * - Hands out the access token and its expiry only, never the refresh token: Core rotates the
 *   refresh token on every renewal and revokes the whole session when a used one comes back, so
 *   only a holder of the lock may present it, and the renderer never does
 * - Never logs a token; nothing is kept beyond the call (no cache, no second file)
 * - Writes only a version-1 file, through a temp file and a rename, mode 0600, other entries as read
 * - No renewal without the lock: a lock still held after the wait gives back what the file has now
 * - A refusal leaves the file alone: the CLI or the hand drops the dead entry on its next use
 */

import { randomBytes } from "node:crypto";
import { chmod, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/** The one Core the window borrows a sign-in for (`packages/app/src/groupon/environments.ts`). */
export const PRODUCTION_CORE_URL = "https://api-core.livingsocial.com";

/** What the window gets: the token to send now and when it lapses. */
export interface DeskSession {
  accessToken: string;
  accessExpiresAt: string;
}

/** The file's session entry, as the CLI writes it. */
export interface DeskSessionEntry extends DeskSession {
  refreshToken: string;
}

export interface DeskSessionDeps {
  /** The credentials file. */
  file: string;
  coreUrl: string;
  now: () => number;
  fetch: typeof fetch;
  /** The access token must stay good this long, else it is renewed. */
  freshForMs: number;
  /** How long to wait for another holder's lock; the CLI's 5 s unless a test says otherwise. */
  lockWaitMs?: number;
}

const FILE_VERSION = 1;
const FILE_MODE = 0o600;
const REFRESH_PATH = "/auth/authentication/token/refresh";
/** The CLI's own figures (`storage.ts`, `transport.ts`): the same lock means the same waits. */
const REQUEST_TIMEOUT_MS = 10_000;
const LOCK_SUFFIX = ".refresh.lock";
const LOCK_POLL_INTERVAL_MS = 50;
const LOCK_MAX_WAIT_MS = 5_000;
const LOCK_STALE_MS = REQUEST_TIMEOUT_MS * 3;
/** The hand renews 60 s ahead of expiry; the window asks for the same margin. */
export const DESK_SESSION_FRESH_FOR_MS = 60_000;

export function deskCredentialsPath(
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
): string {
  const configured = env.XDG_CONFIG_HOME?.trim();
  const base = configured ? configured : path.join(home, ".config");
  return path.join(base, "groupon", "credentials");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The CLI's key for a Core: `scheme://host[:port]`. */
function normaliseCoreUrl(raw: string): string {
  const url = new URL(raw.trim());
  return `${url.protocol}//${url.host}`;
}

type FileRead = { kind: "ok"; credentials: Record<string, unknown> } | { kind: "unusable" };

async function readCredentialsFile(file: string): Promise<FileRead> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return { kind: "unusable" };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && parsed.version === FILE_VERSION && isRecord(parsed.credentials)) {
      return { kind: "ok", credentials: parsed.credentials };
    }
  } catch {
    // Malformed: read as no sign-in.
  }
  return { kind: "unusable" };
}

function entryOf(value: unknown): DeskSessionEntry | null {
  if (
    !isRecord(value) ||
    value.type !== "session" ||
    typeof value.accessToken !== "string" ||
    typeof value.refreshToken !== "string" ||
    typeof value.accessExpiresAt !== "string" ||
    value.accessToken === "" ||
    value.refreshToken === ""
  ) {
    return null;
  }
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    accessExpiresAt: value.accessExpiresAt,
  };
}

export async function readDeskSessionEntry(
  file: string,
  coreUrl: string,
): Promise<DeskSessionEntry | null> {
  const read = await readCredentialsFile(file);
  if (read.kind !== "ok") return null;
  return entryOf(read.credentials[normaliseCoreUrl(coreUrl)]);
}

function isFresh(entry: DeskSession, now: number, freshForMs: number): boolean {
  const expiresAt = Date.parse(entry.accessExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt - now > freshForMs;
}

const sessionOf = (entry: DeskSession): DeskSession => ({
  accessToken: entry.accessToken,
  accessExpiresAt: entry.accessExpiresAt,
});

/** The CLI's lock: create-exclusive, a lock older than its stale age reclaimed. Null when not won. */
async function acquireLock(
  lockPath: string,
  waitMs: number,
): Promise<(() => Promise<void>) | null> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      return () => rm(lockPath, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") return null;
      const reclaimed = await stat(lockPath)
        .then(async (info) => {
          if (Date.now() - info.mtimeMs <= LOCK_STALE_MS) return false;
          await rm(lockPath, { force: true });
          return true;
        })
        .catch(() => false);
      if (!reclaimed) await new Promise((resolve) => setTimeout(resolve, LOCK_POLL_INTERVAL_MS));
    }
  }
  return null;
}

async function renew(
  deps: DeskSessionDeps,
  refreshToken: string,
): Promise<DeskSessionEntry | null> {
  let response: Response;
  try {
    response = await deps.fetch(`${deps.coreUrl}${REFRESH_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ token: refreshToken }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body: unknown = await response.json().catch(() => null);
  if (
    !isRecord(body) ||
    typeof body.token !== "string" ||
    typeof body.expiresAt !== "string" ||
    typeof body.refreshTokenValue !== "string"
  ) {
    return null;
  }
  return {
    accessToken: body.token,
    refreshToken: body.refreshTokenValue,
    accessExpiresAt: body.expiresAt,
  };
}

/** Puts one entry back the way the CLI's `storeSessionToken` does; other entries as read. */
async function writeEntry(file: string, coreUrl: string, entry: DeskSessionEntry): Promise<void> {
  const read = await readCredentialsFile(file);
  if (read.kind !== "ok") return;
  const next = {
    version: FILE_VERSION,
    credentials: {
      ...read.credentials,
      [normaliseCoreUrl(coreUrl)]: {
        type: "session",
        refreshToken: entry.refreshToken,
        accessToken: entry.accessToken,
        accessExpiresAt: entry.accessExpiresAt,
        createdAt: new Date().toISOString(),
      },
    },
  };
  const temporary = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, {
      encoding: "utf8",
      mode: FILE_MODE,
      flag: "wx",
    });
    await chmod(temporary, FILE_MODE);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * This Mac's production sign-in with an access token good for `freshForMs`, renewed under the
 * CLI's lock when the file's is not; null when the Mac has no such sign-in or it cannot be renewed.
 */
export async function resolveDeskSession(deps: DeskSessionDeps): Promise<DeskSession | null> {
  const stored = await readDeskSessionEntry(deps.file, deps.coreUrl);
  if (!stored) return null;
  if (isFresh(stored, deps.now(), deps.freshForMs)) return sessionOf(stored);

  const release = await acquireLock(
    `${deps.file}${LOCK_SUFFIX}`,
    deps.lockWaitMs ?? LOCK_MAX_WAIT_MS,
  );
  if (!release) {
    const latest = await readDeskSessionEntry(deps.file, deps.coreUrl);
    return latest && isFresh(latest, deps.now(), 0) ? sessionOf(latest) : null;
  }
  try {
    // The hand or the CLI may have renewed it while this one waited for the lock.
    const latest = await readDeskSessionEntry(deps.file, deps.coreUrl);
    if (!latest) return null;
    if (isFresh(latest, deps.now(), deps.freshForMs)) return sessionOf(latest);
    const renewed = await renew(deps, latest.refreshToken);
    if (!renewed) return isFresh(latest, deps.now(), 0) ? sessionOf(latest) : null;
    await writeEntry(deps.file, deps.coreUrl, renewed);
    return sessionOf(renewed);
  } finally {
    await release();
  }
}

/** The main process's answer to the window: production only, the file this Mac's CLI uses. */
export function readDeskSessionForWindow(): Promise<DeskSession | null> {
  return resolveDeskSession({
    file: deskCredentialsPath(),
    coreUrl: PRODUCTION_CORE_URL,
    now: Date.now,
    fetch: globalThis.fetch,
    freshForMs: DESK_SESSION_FRESH_FOR_MS,
  });
}

/**
 * Whether a frame may ask for the sign-in: the window's own pages (`groupon-desk://app`), and in a
 * development run the Expo dev server's; never a browser tab's page or any other origin.
 */
export function isDeskSessionCaller(
  frameUrl: string | undefined,
  appScheme: string,
  devServerUrl: string | null,
): boolean {
  if (!frameUrl) return false;
  let url: URL;
  try {
    url = new URL(frameUrl);
  } catch {
    return false;
  }
  if (url.protocol === `${appScheme}:` && url.host === "app") return true;
  if (devServerUrl === null) return false;
  try {
    return url.origin === new URL(devServerUrl).origin;
  } catch {
    return false;
  }
}
