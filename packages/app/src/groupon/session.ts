// Added for Groupon Desk (fork of Paseo, Apache-2.0): who is signed in, to which Core, and the vault key.

/**
 * The Groupon side of the app's state, one zustand store:
 *
 * - the Core the person chose (production, staging, or a local Core whose address they typed);
 * - the session the device sign-in issued (access JWT, refresh JWT, expiry), refreshed before it
 *   lapses and once more on a 401;
 * - the vault key, derived once from the passphrase on this device and kept in the keychain, and
 *   the seal key that opens what the person's Macs sealed on the hub;
 * - the person's identity (an X25519 pair from the vault key), whose public half is published on
 *   the hub once the vault opens, so a colleague can share a workspace with them (design section 13).
 *
 * Nothing here is logged except the derivation's duration. Signing out deletes the session and
 * the vault key from the keychain.
 *
 * The signed-in Core is also the relay every Paseo host can be reached through
 * (`core-relay.ts`): this module names it there, with a token getter that refreshes first.
 */

import { create } from "zustand";
import {
  CoreError,
  coreRequest,
  identityOf,
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
import { deleteSecret, readSecret, writeSecret } from "./secure-storage";

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
  refreshToken: string;
  accessExpiresAt: string;
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

  hydrate: async () => {
    await adoptDevelopmentSession();
    const environment = parseJson<{ id: GrouponEnvironmentId; coreUrl: string }>(
      await readSecret(ENVIRONMENT_KEY),
    );
    const environmentId = environment?.id ?? DEFAULT_ENVIRONMENT_ID;
    const coreUrl = environment?.coreUrl ?? environmentById(environmentId).coreUrl;
    const session = parseJson<GrouponSession>(await readSecret(SESSION_KEY));
    if (!session || session.coreUrl !== coreUrl) {
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
    const stored = parseJson<StoredVaultKey>(await readSecret(VAULT_KEY_KEY));
    const vaultKey =
      stored && stored.coreUrl === coreUrl && stored.userId === identity.userId
        ? base64ToBytes(stored.key)
        : null;
    set({
      environmentId,
      coreUrl,
      session,
      identity,
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
    set({ session, identity: identityOf(session.accessToken), status: "vault" });
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
    });
  },
}));

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

let refreshing: Promise<GrouponSession> | null = null;

async function refreshSession(session: GrouponSession): Promise<GrouponSession> {
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
        await useGrouponStore.getState().signOut();
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
