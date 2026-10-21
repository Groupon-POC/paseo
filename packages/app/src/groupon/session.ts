// Added for Groupon Desk (fork of Paseo, Apache-2.0): who is signed in, to which Core, and the vault key.

/**
 * The Groupon side of the app's state, one zustand store:
 *
 * - the Core the person chose (production, staging, or a local Core whose address they typed);
 * - the session the sign-in issued (the web build's redirect to Groupon's SSO gateway,
 *   `sso-redirect.ts`, or the device code; access JWT, refresh JWT, expiry), refreshed before it
 *   lapses and once more on a 401; in the desktop window, when it has none of its own (or its own
 *   can no longer be renewed), this Mac's sign-in, the one Groupon Desk and the `groupon` CLI share
 *   (`mac-session.ts`), held in memory only and asked for again instead of renewed here;
 * - the vault key, derived once from the passphrase on this device and kept in the keychain (in a
 *   browser sealed under a non-extractable device key in IndexedDB, `secure-storage.web.ts`), and
 *   the seal key that opens what the person's Macs sealed on the hub; in the desktop window, when
 *   none is kept here, the key Groupon Desk keeps in this Mac's login keychain for the same person,
 *   kept here once it opens the hub's vault, as if the passphrase had been typed;
 * - the person's identity (an X25519 pair from the vault key), whose public half is published on
 *   the hub once the vault opens, so a colleague can share a workspace with them (design section 13).
 *
 * Nothing here is logged except the derivation's duration. Signing out deletes the session and
 * the vault key from the keychain; it signs out this window only, never the Mac's own sign-in,
 * which the window takes again when it next starts.
 *
 * The signed-in Core is also the relay every Paseo host can be reached through
 * (`core-relay.ts`): this module names it there, with a token getter that refreshes first.
 */

import { Platform } from "react-native";
import { create } from "zustand";
import {
  CoreError,
  coreRequest,
  identityOf,
  expiryOf,
  tokenRefresh,
  type DeviceAuthPoll,
  type TokenIdentity,
} from "./core-client";
import {
  base64ToBytes,
  bytesToBase64,
  deriveVaultKey,
  identityFromVaultKey,
  openVault,
  parseVaultEnvelope,
  pbkdf2EngineAvailable,
  sealKeyFromVaultKey,
  VaultError,
  type DeskIdentity,
  type Pbkdf2Engine,
} from "./crypto";
import { setCoreRelayRoute } from "./core-relay";
import {
  defaultEnvironmentId,
  environmentById,
  normaliseCoreUrl,
  type GrouponEnvironmentId,
} from "./environments";
import { readMacSession, readMacVaultKey } from "./mac-session";
import { deleteSecret, readSecret, writeSecret } from "./secure-storage";
import {
  completeSsoCallback,
  isSsoCallback,
  setSsoReturnPath,
  SSO_CALLBACK_PATH,
} from "./sso-redirect";

const ENVIRONMENT_KEY = "groupon-desk.environment";
const SESSION_KEY = "groupon-desk.session";
const VAULT_KEY_KEY = "groupon-desk.vault-key";
/** Refresh an access token this long before it lapses. */
const REFRESH_MARGIN_MS = 60_000;
/** The Core before the person picks one: production, or the local Core in a development bundle. */
const DEFAULT_ENVIRONMENT_ID = defaultEnvironmentId(__DEV__);

export type GrouponGateStatus = "loading" | "signedOut" | "vault" | "ready";

export interface GrouponSession {
  coreUrl: string;
  accessToken: string;
  /** Empty for a session borrowed from this Mac: the window never renews that one itself. */
  refreshToken: string;
  accessExpiresAt: string;
  /** "mac": this Mac's sign-in (`mac-session.ts`), never stored by the window. */
  origin?: "mac";
}

export interface VaultUnlockMeasure {
  ms: number;
  engine: Pbkdf2Engine;
  iterations: number;
}

interface GrouponState {
  status: GrouponGateStatus;
  environmentId: GrouponEnvironmentId;
  coreUrl: string;
  session: GrouponSession | null;
  identity: TokenIdentity | null;
  sealKey: Uint8Array | null;
  /** The person's identity, from the vault key; null while the vault is not open here. */
  deskIdentity: DeskIdentity | null;
  lastUnlock: VaultUnlockMeasure | null;
  /** Why the last redirect sign-in did not finish, shown beside the sign-in button. */
  signInError: string | null;
  hydrate: () => Promise<void>;
  chooseEnvironment: (id: GrouponEnvironmentId, coreUrl?: string) => Promise<void>;
  acceptApprovedPoll: (poll: DeviceAuthPoll) => Promise<void>;
  unlockVault: (passphrase: string) => Promise<VaultUnlockMeasure>;
  signOut: () => Promise<void>;
}

interface StoredVaultKey {
  coreUrl: string;
  userId: string | null;
  key: string;
}

function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export const useGrouponStore = create<GrouponState>((set, get) => ({
  status: "loading",
  environmentId: DEFAULT_ENVIRONMENT_ID,
  coreUrl: environmentById(DEFAULT_ENVIRONMENT_ID).coreUrl,
  session: null,
  identity: null,
  sealKey: null,
  deskIdentity: null,
  lastUnlock: null,
  signInError: null,

  hydrate: async () => {
    await adoptDevelopmentSession();
    const environment = parseJson<{ id: GrouponEnvironmentId; coreUrl: string }>(
      await readSecret(ENVIRONMENT_KEY),
    );
    const environmentId = environment?.id ?? DEFAULT_ENVIRONMENT_ID;
    const coreUrl = environment?.coreUrl ?? environmentById(environmentId).coreUrl;
    const own = parseJson<GrouponSession>(await readSecret(SESSION_KEY));
    const session =
      own && own.coreUrl === coreUrl && !refreshLapsed(own) ? own : await macSessionFor(coreUrl);
    if (!session) {
      set({
        status: "signedOut",
        environmentId,
        coreUrl,
        session: null,
        identity: null,
        sealKey: null,
        deskIdentity: null,
      });
      return;
    }
    const identity = identityOf(session.accessToken);
    set({ environmentId, coreUrl, session, identity });
    const vaultKey = await keptVaultKey(coreUrl, identity);
    set({
      sealKey: vaultKey ? sealKeyFromVaultKey(vaultKey) : null,
      deskIdentity: vaultKey ? identityFromVaultKey(vaultKey) : null,
      status: vaultKey ? "ready" : "vault",
    });
    publishDeskIdentity();
  },

  chooseEnvironment: async (id, typedCoreUrl) => {
    const coreUrl = typedCoreUrl ?? environmentById(id).coreUrl;
    await writeSecret(ENVIRONMENT_KEY, JSON.stringify({ id, coreUrl }));
    set({ environmentId: id, coreUrl });
  },

  acceptApprovedPoll: async (poll) => {
    if (!poll.accessToken || !poll.refreshToken || !poll.accessTokenExpiresAt) {
      throw new CoreError("Core approved the sign-in without a session.", null);
    }
    const session: GrouponSession = {
      coreUrl: get().coreUrl,
      accessToken: poll.accessToken,
      refreshToken: poll.refreshToken,
      accessExpiresAt: String(poll.accessTokenExpiresAt),
    };
    await writeSecret(SESSION_KEY, JSON.stringify(session));
    const identity = identityOf(session.accessToken);
    set({ session, identity, signInError: null });
    const vaultKey = await keptVaultKey(session.coreUrl, identity);
    set({
      sealKey: vaultKey ? sealKeyFromVaultKey(vaultKey) : null,
      deskIdentity: vaultKey ? identityFromVaultKey(vaultKey) : null,
      status: vaultKey ? "ready" : "vault",
    });
  },

  unlockVault: async (passphrase) => {
    const answer = await grouponRequest<{ vault: { envelope: string } | null }>(
      "/user/groupon_desk/vault",
    );
    if (!answer.vault) {
      throw new VaultError(
        "You have no vault on this Core yet. Open Groupon Desk on your Mac and set a vault passphrase there first.",
      );
    }
    const envelope = parseVaultEnvelope(answer.vault.envelope);
    const engine = pbkdf2EngineAvailable();
    const started = Date.now();
    const vaultKey = await deriveVaultKey(
      passphrase,
      base64ToBytes(envelope.kdf.salt),
      envelope.kdf.iterations,
      engine,
    );
    const measure: VaultUnlockMeasure = {
      ms: Date.now() - started,
      engine,
      iterations: envelope.kdf.iterations,
    };
    // The one figure this module logs: how long the device took, never the passphrase or key.
    console.info(
      `[groupon] vault key derived in ${measure.ms} ms (PBKDF2-SHA256, ${measure.iterations} rounds, ${engine})`,
    );
    openVault(envelope, vaultKey);
    const { coreUrl, identity } = get();
    const stored: StoredVaultKey = {
      coreUrl,
      userId: identity?.userId ?? null,
      key: bytesToBase64(vaultKey),
    };
    await writeSecret(VAULT_KEY_KEY, JSON.stringify(stored));
    set({
      sealKey: sealKeyFromVaultKey(vaultKey),
      deskIdentity: identityFromVaultKey(vaultKey),
      status: "ready",
      lastUnlock: measure,
    });
    publishDeskIdentity();
    return measure;
  },

  signOut: async () => {
    await deleteSecret(SESSION_KEY);
    await deleteSecret(VAULT_KEY_KEY);
    set({
      status: "signedOut",
      session: null,
      identity: null,
      sealKey: null,
      deskIdentity: null,
      lastUnlock: null,
      signInError: null,
    });
  },
}));

/**
 * The gateway's return to the web build, before the gate hydrates: the code is exchanged and the
 * session kept where the device sign-in keeps it, so `hydrate` opens it and the vault step follows
 * as before. A failure stays on the sign-in step with its reason. Either way the code leaves the
 * address bar and the history entry, and the callback route later sends the router to the page the
 * person pressed Sign in on. Does nothing off the web or on any other path.
 */
export async function finishSsoRedirect(): Promise<void> {
  if (Platform.OS !== "web" || typeof window === "undefined" || !window.location) return;
  const href = window.location.href;
  if (!isSsoCallback(href)) return;
  const result = await completeSsoCallback(href, {
    storage: window.sessionStorage,
    fetch: (input, init) => fetch(input, init),
  });
  window.history.replaceState(window.history.state, "", SSO_CALLBACK_PATH);
  setSsoReturnPath(result.returnTo);
  if (result.kind === "signedIn") {
    await writeSecret(SESSION_KEY, JSON.stringify(result.session satisfies GrouponSession));
    useGrouponStore.setState({ signInError: null });
  } else if (result.kind === "failed") {
    useGrouponStore.setState({ signInError: result.message });
  }
}

/**
 * A development build's test seam, and nothing more: Core approves a device sign-in only from a
 * person's Google session, which no test can have. So a development bundle may carry a local
 * Core's session in `EXPO_PUBLIC_GROUPON_DEV_SESSION` (JSON of `GrouponSession`), inlined by Metro
 * at bundle time. It is honoured only in `__DEV__` and only for a loopback Core; a release build
 * and every hosted Core ignore it. The vault passphrase is still typed.
 */
async function adoptDevelopmentSession(): Promise<void> {
  const raw = process.env.EXPO_PUBLIC_GROUPON_DEV_SESSION;
  if (!__DEV__ || !raw) return;
  const candidate = parseJson<GrouponSession>(raw);
  const coreUrl = candidate ? normaliseCoreUrl(candidate.coreUrl) : null;
  if (!candidate || !coreUrl || !coreUrl.startsWith("http://")) return;
  if (await readSecret(SESSION_KEY)) return;
  await writeSecret(ENVIRONMENT_KEY, JSON.stringify({ id: "local", coreUrl }));
  await writeSecret(SESSION_KEY, JSON.stringify({ ...candidate, coreUrl }));
}

/** The Core whose sign-in this Mac lends the desktop window (main reads production only). */
const MAC_SESSION_CORE_URL = environmentById("production").coreUrl;

/** This Mac's sign-in for `coreUrl`, as a session the window holds in memory only. */
async function macSessionFor(coreUrl: string): Promise<GrouponSession | null> {
  if (coreUrl !== MAC_SESSION_CORE_URL) return null;
  const mac = await readMacSession();
  if (!mac) return null;
  return { coreUrl, ...mac, refreshToken: "", origin: "mac" };
}

/**
 * The vault key for this person: the one kept here, else (desktop window, production) the one
 * Groupon Desk keeps in this Mac's keychain for the same user, once it opens the hub's vault; it is
 * then kept here as if typed. Null when neither is there: the passphrase step shows.
 */
async function keptVaultKey(coreUrl: string, identity: TokenIdentity): Promise<Uint8Array | null> {
  const stored = parseJson<StoredVaultKey>(await readSecret(VAULT_KEY_KEY));
  if (stored && stored.coreUrl === coreUrl && stored.userId === identity.userId) {
    return base64ToBytes(stored.key);
  }
  if (coreUrl !== MAC_SESSION_CORE_URL || !identity.userId) return null;
  const mac = await readMacVaultKey();
  if (!mac || mac.userId !== identity.userId) return null;
  try {
    const answer = await grouponRequest<{ vault: { envelope: string } | null }>(
      "/user/groupon_desk/vault",
    );
    if (!answer.vault) return null;
    const envelope = parseVaultEnvelope(answer.vault.envelope);
    const sameSalt =
      bytesToBase64(base64ToBytes(envelope.kdf.salt)) === bytesToBase64(base64ToBytes(mac.salt));
    if (!sameSalt || envelope.kdf.iterations !== mac.iterations) return null;
    const vaultKey = base64ToBytes(mac.key);
    openVault(envelope, vaultKey);
    const kept: StoredVaultKey = { coreUrl, userId: identity.userId, key: bytesToBase64(vaultKey) };
    await writeSecret(VAULT_KEY_KEY, JSON.stringify(kept));
    return vaultKey;
  } catch {
    // The hub could not be read, or the keychain's key does not open this vault: ask the passphrase.
    return null;
  }
}

/** A stored session whose refresh JWT has lapsed cannot be renewed: read as none. */
function refreshLapsed(session: GrouponSession): boolean {
  const expiresAt = expiryOf(session.refreshToken);
  return expiresAt !== null && expiresAt <= Date.now();
}

let refreshing: Promise<GrouponSession> | null = null;

/**
 * A borrowed session is asked for again, never renewed here; when the Mac has none left, the
 * window shows the sign-in, keeping its storage (nobody signed out of the window).
 */
async function retakeMacSession(session: GrouponSession): Promise<GrouponSession> {
  const next = await macSessionFor(session.coreUrl);
  if (!next) {
    useGrouponStore.setState({
      status: "signedOut",
      session: null,
      identity: null,
      sealKey: null,
      deskIdentity: null,
    });
    throw new CoreError("This Mac's Groupon sign-in has ended. Sign in again.", 401);
  }
  useGrouponStore.setState({ session: next, identity: identityOf(next.accessToken) });
  return next;
}

async function refreshSession(session: GrouponSession): Promise<GrouponSession> {
  if (session.origin === "mac") {
    refreshing ??= retakeMacSession(session).finally(() => {
      refreshing = null;
    });
    return refreshing;
  }
  refreshing ??= (async () => {
    try {
      const answer = await tokenRefresh(session.coreUrl, session.refreshToken);
      const next: GrouponSession = {
        coreUrl: session.coreUrl,
        accessToken: answer.token,
        refreshToken: answer.refreshTokenValue ?? session.refreshToken,
        accessExpiresAt: String(answer.expiresAt),
      };
      await writeSecret(SESSION_KEY, JSON.stringify(next));
      useGrouponStore.setState({ session: next, identity: identityOf(next.accessToken) });
      return next;
    } catch (error) {
      if (error instanceof CoreError && error.status !== null && error.status < 500) {
        // Core refused the window's own session: this Mac's sign-in, if it has one, takes over.
        await deleteSecret(SESSION_KEY);
        await useGrouponStore.getState().hydrate();
        const next = useGrouponStore.getState().session;
        if (next) return next;
      }
      throw error;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function freshSession(): Promise<GrouponSession> {
  const session = useGrouponStore.getState().session;
  if (!session) throw new CoreError("Not signed in to Groupon.", 401);
  const expiresAt = Date.parse(session.accessExpiresAt);
  if (Number.isFinite(expiresAt) && expiresAt - Date.now() < REFRESH_MARGIN_MS)
    return refreshSession(session);
  return session;
}

setCoreRelayRoute(() => {
  const session = useGrouponStore.getState().session;
  if (!session) return null;
  return {
    coreUrl: session.coreUrl,
    accessToken: async () => (await freshSession()).accessToken,
  };
});

/** A read of the signed-in person's Core, with one refresh and retry on a 401. */
export async function grouponRequest<T>(path: string): Promise<T> {
  return grouponSend<T>(path, "GET");
}

/** A call to the signed-in person's Core with a body, with one refresh and retry on a 401. */
export async function grouponSend<T>(
  path: string,
  method: "GET" | "POST" | "PUT",
  body?: unknown,
): Promise<T> {
  const session = await freshSession();
  try {
    return await coreRequest<T>(session.coreUrl, path, {
      method,
      body,
      token: session.accessToken,
    });
  } catch (error) {
    if (!(error instanceof CoreError) || error.status !== 401) throw error;
    const next = await refreshSession(session);
    return coreRequest<T>(next.coreUrl, path, { method, body, token: next.accessToken });
  }
}

/**
 * The identity's public half on the hub, so a colleague's Mac can box a shared workspace's key to
 * this person. Best-effort: a hub that refuses it now is asked again on the next open.
 */
function publishDeskIdentity(): void {
  const { deskIdentity, session } = useGrouponStore.getState();
  if (!deskIdentity || !session) return;
  void grouponSend("/user/groupon_desk/identity", "PUT", {
    publicKey: bytesToBase64(deskIdentity.publicKey),
  }).catch((error: unknown) => {
    console.warn(
      `[groupon] identity not published: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
}
