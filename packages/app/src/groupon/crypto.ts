// Added for Groupon Desk (fork of Paseo, Apache-2.0): the vault key, the hub's seal and a shared workspace's keys, on the device.

/**
 * The two formats Groupon Desk shares with the `groupon` CLI and the Mac app, opened here:
 *
 * - the vault (`groupon-desk-vault/1`): PBKDF2-HMAC-SHA256 of the passphrase (NFC) with the vault's
 *   salt and iterations to a 256-bit key; AES-256-GCM with the format name as associated data
 *   (monorepo `packages/groupon-cli/src/desk/vault.ts`);
 * - the seal on everything the hub stores (`groupon-desk-relay/1`): relay key = HKDF-SHA256(vault
 *   key, info "groupon-desk-relay/1"), seal key = HKDF-SHA256(relay key, info
 *   "groupon-desk-relay/1/seal"); AES-256-GCM, nonce | ciphertext | tag in base64, associated data
 *   "groupon-desk-relay/1:<scope>:<kind>" (monorepo `packages/groupon-cli/src/hand/seal.ts`).
 *
 * - a shared workspace (monorepo `packages/groupon-cli/src/hand/share-seal.ts`; design section 13 of
 *   `_documentation/design/groupon-desk-work-window-design.md`): the person's identity, an X25519
 *   key pair from HKDF-SHA256(relay key, info "groupon-desk-relay/1/identity"); the workspace's
 *   share key out of the NaCl box the owner's hand made (naming the workspace and the version);
 *   a body under the share key with the same seal as under a relay key.
 *
 * The device opens, and seals only one thing: a colleague's prompt under a share key.
 * `crypto.test.ts` pins every format to the CLI's vectors.
 */

import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha2";
import nacl from "tweetnacl";

export const VAULT_FORMAT = "groupon-desk-vault/1";
export const RELAY_LABEL = "groupon-desk-relay/1";
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/\s+/g, ""));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface VaultEnvelope {
  format: string;
  kdf: { name: string; iterations: number; salt: string };
  cipher: string;
  nonce: string;
  ciphertext: string;
  tag: string;
}

export class VaultError extends Error {}

export function parseVaultEnvelope(text: string): VaultEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new VaultError("The vault on the hub is not readable.");
  }
  const v = value as Partial<VaultEnvelope> | null;
  if (
    !v ||
    v.format !== VAULT_FORMAT ||
    typeof v.kdf?.iterations !== "number" ||
    typeof v.kdf?.salt !== "string" ||
    typeof v.nonce !== "string" ||
    typeof v.ciphertext !== "string" ||
    typeof v.tag !== "string"
  ) {
    throw new VaultError(`The vault on the hub is not ${VAULT_FORMAT}.`);
  }
  return v as VaultEnvelope;
}

/** WebCrypto's PBKDF2 where the platform has it (browsers), else the pure-JS one (Hermes). */
export type Pbkdf2Engine = "webcrypto" | "js";

export function pbkdf2EngineAvailable(): Pbkdf2Engine {
  return typeof globalThis.crypto?.subtle?.deriveBits === "function" ? "webcrypto" : "js";
}

/** The vault key: PBKDF2-HMAC-SHA256, 32 bytes. Slow on purpose (600,000 rounds). */
export async function deriveVaultKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  engine: Pbkdf2Engine = pbkdf2EngineAvailable(),
): Promise<Uint8Array> {
  if (passphrase.length === 0) throw new VaultError("The passphrase is empty.");
  const password = encoder.encode(passphrase.normalize("NFC"));
  if (engine === "webcrypto") {
    const subtle = globalThis.crypto.subtle;
    const material = await subtle.importKey("raw", new Uint8Array(password), "PBKDF2", false, [
      "deriveBits",
    ]);
    const bits = await subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt: new Uint8Array(salt), iterations },
      material,
      256,
    );
    return new Uint8Array(bits);
  }
  // asyncTick yields to the UI so the spinner keeps turning while Hermes grinds.
  return pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32, asyncTick: 25 });
}

function openGcm(
  key: Uint8Array,
  nonce: Uint8Array,
  body: Uint8Array,
  aad: Uint8Array,
): Uint8Array | null {
  try {
    return gcm(key, nonce, aad).decrypt(body);
  } catch {
    return null;
  }
}

/** The vault's contents, proving the key is right; a wrong passphrase and a touched envelope are one error. */
export function openVault(envelope: VaultEnvelope, vaultKey: Uint8Array): unknown {
  const body = new Uint8Array([
    ...base64ToBytes(envelope.ciphertext),
    ...base64ToBytes(envelope.tag),
  ]);
  const plain = openGcm(
    vaultKey,
    base64ToBytes(envelope.nonce),
    body,
    encoder.encode(VAULT_FORMAT),
  );
  if (plain === null) throw new VaultError("That passphrase does not open your vault.");
  return JSON.parse(decoder.decode(plain));
}

export function relayKey(vaultKey: Uint8Array): Uint8Array {
  return hkdf(sha256, vaultKey, undefined, encoder.encode(RELAY_LABEL), 32);
}

/** The key that opens the hub's sealed boxes, from the vault key. */
export function sealKeyFromVaultKey(vaultKey: Uint8Array): Uint8Array {
  return hkdf(sha256, relayKey(vaultKey), undefined, encoder.encode(`${RELAY_LABEL}/seal`), 32);
}

/** A sealed box's plaintext, or null when it was sealed for another scope or kind, or another key. */
export function openSealed(
  sealed: string,
  scope: string,
  kind: string,
  sealKey: Uint8Array,
): Uint8Array | null {
  let combined: Uint8Array;
  try {
    combined = base64ToBytes(sealed);
  } catch {
    return null;
  }
  if (combined.length < NONCE_BYTES + TAG_BYTES) return null;
  return openGcm(
    sealKey,
    combined.subarray(0, NONCE_BYTES),
    combined.subarray(NONCE_BYTES),
    encoder.encode(`${RELAY_LABEL}:${scope}:${kind}`),
  );
}

export function openSealedText(
  sealed: string,
  scope: string,
  kind: string,
  sealKey: Uint8Array,
): string | null {
  const plain = openSealed(sealed, scope, kind, sealKey);
  return plain === null ? null : decoder.decode(plain);
}

export function openSealedJson(
  sealed: string,
  scope: string,
  kind: string,
  sealKey: Uint8Array,
): unknown {
  const text = openSealedText(sealed, scope, kind, sealKey);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** The person's identity: the same X25519 pair on every device of theirs, from the vault key. */
export interface DeskIdentity {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function identityFromVaultKey(vaultKey: Uint8Array): DeskIdentity {
  const seed = hkdf(
    sha256,
    relayKey(vaultKey),
    undefined,
    encoder.encode(`${RELAY_LABEL}/identity`),
    32,
  );
  const pair = nacl.box.keyPair.fromSecretKey(seed);
  return { publicKey: pair.publicKey, secretKey: pair.secretKey };
}

/** The key that opens and seals bodies under a share key: the same derivation as from a relay key. */
export function sealKeyFromShareKey(shareKey: Uint8Array): Uint8Array {
  return hkdf(sha256, shareKey, undefined, encoder.encode(`${RELAY_LABEL}/seal`), 32);
}

const BOX_NONCE_BYTES = 24;

/**
 * A shared workspace's key out of the owner's box: null when the box does not open with this pair,
 * or names another workspace or version than the hub says it is for.
 */
export function openShareKeyBox(
  sealed: string,
  workspaceId: string,
  version: number,
  ownerPublicKey: Uint8Array,
  mine: DeskIdentity,
): Uint8Array | null {
  let combined: Uint8Array;
  try {
    combined = base64ToBytes(sealed);
  } catch {
    return null;
  }
  if (combined.length <= BOX_NONCE_BYTES) return null;
  const plain = nacl.box.open(
    combined.subarray(BOX_NONCE_BYTES),
    combined.subarray(0, BOX_NONCE_BYTES),
    ownerPublicKey,
    mine.secretKey,
  );
  if (plain === null) return null;
  try {
    const value = JSON.parse(decoder.decode(plain)) as Record<string, unknown>;
    if (value.v !== 1 || value.workspaceId !== workspaceId || value.version !== version)
      return null;
    if (typeof value.key !== "string") return null;
    const key = base64ToBytes(value.key);
    return key.length === 32 ? key : null;
  } catch {
    return null;
  }
}

/** `plain` sealed for `scope` and `kind` with a fresh nonce: the hub's seal, for a colleague's prompt. */
export function sealText(
  plain: string,
  scope: string,
  kind: string,
  sealKey: Uint8Array,
  nonce: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(NONCE_BYTES)),
): string {
  const body = gcm(sealKey, nonce, encoder.encode(`${RELAY_LABEL}:${scope}:${kind}`)).encrypt(
    encoder.encode(plain),
  );
  return bytesToBase64(new Uint8Array([...nonce, ...body]));
}
