// Added for Groupon Desk (fork of Paseo, Apache-2.0): pins the device's opener to the CLI's vectors.
import { describe, expect, it } from "vitest";
import {
  base64ToBytes,
  deriveVaultKey,
  openSealedJson,
  openSealedText,
  openVault,
  parseVaultEnvelope,
  sealKeyFromVaultKey,
  VaultError,
} from "./crypto";

const hex = (value: string) =>
  new Uint8Array(value.match(/../g)!.map((pair) => parseInt(pair, 16)));

// monorepo packages/groupon-cli/tests/hand/seal.test.ts: scope "chat-1", kind "message".
const SEAL_VAULT_KEY = hex("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
const SEAL_PINNED =
  "Dw4NDAsKCQgHBgUE+qfo+3icPQW6kHxNZZbZqQWGInhifa6T+3hoh3fvoFK1hPM7wixUevtq96WpfZ90/m+SrwkB";
const SEAL_BODY = '{"v":1,"kind":"notice","text":"hello"}';

// monorepo packages/groupon-cli/tests/desk/vault.test.ts, PINNED_VECTOR.
const VAULT_PASSPHRASE = "correct horse battery staple";
const VAULT_PINNED =
  '{"format":"groupon-desk-vault/1","kdf":{"name":"pbkdf2-hmac-sha256","iterations":600000,"salt":"AAECAwQFBgcICQoLDA0ODw=="},"cipher":"aes-256-gcm","nonce":"AAECAwQFBgcICQoL","ciphertext":"deT+5APHVeOCC71ykJ/73JP82WqqaL0WDDYVE7pG3GHbFU3u41psIHFU0LtwGjbSxuWlUmEaPZ4n4yMjkYlSROFGz0nggcVmo5VdzQriv9LBpIIYO/AdPVZLjMt8h9o4mqmbKqtJfh7eU7Q/Zy1pLU4=","tag":"GY/lTdLJ6y7PLLEbdEhspA=="}';
const VAULT_CONTENTS = {
  version: 1,
  savedAt: "2026-09-23T12:00:00.000Z",
  machine: "vector",
  settings: { a: 1 },
  crons: [],
  accounts: [],
};

describe("the hub's seal", () => {
  const sealKey = sealKeyFromVaultKey(SEAL_VAULT_KEY);

  it("opens the CLI's pinned vector", () => {
    expect(openSealedText(SEAL_PINNED, "chat-1", "message", sealKey)).toBe(SEAL_BODY);
    expect(openSealedJson(SEAL_PINNED, "chat-1", "message", sealKey)).toEqual(
      JSON.parse(SEAL_BODY),
    );
  });

  it("refuses another scope, another kind, another key and garbage", () => {
    expect(openSealedText(SEAL_PINNED, "chat-2", "message", sealKey)).toBeNull();
    expect(openSealedText(SEAL_PINNED, "chat-1", "delta", sealKey)).toBeNull();
    expect(
      openSealedText(
        SEAL_PINNED,
        "chat-1",
        "message",
        sealKeyFromVaultKey(new Uint8Array(32).fill(7)),
      ),
    ).toBeNull();
    expect(openSealedText("not base64 at all", "chat-1", "message", sealKey)).toBeNull();
    expect(openSealedText("AAAA", "chat-1", "message", sealKey)).toBeNull();
  });
});

describe("the vault", () => {
  const envelope = parseVaultEnvelope(VAULT_PINNED);
  const salt = base64ToBytes(envelope.kdf.salt);

  it.each(["webcrypto", "js"] as const)(
    "derives the key with %s and opens the CLI's pinned vault",
    async (engine) => {
      const key = await deriveVaultKey(VAULT_PASSPHRASE, salt, envelope.kdf.iterations, engine);
      expect(openVault(envelope, key)).toEqual(VAULT_CONTENTS);
    },
    60_000,
  );

  it("refuses a wrong passphrase with one plain error", async () => {
    const key = await deriveVaultKey("wrong", salt, 1_000, "webcrypto");
    expect(() => openVault(envelope, key)).toThrow(VaultError);
  });

  it("refuses an envelope of another format", () => {
    expect(() => parseVaultEnvelope('{"format":"something-else/1"}')).toThrow(VaultError);
    expect(() => parseVaultEnvelope("not json")).toThrow(VaultError);
  });

  it("refuses an empty passphrase before deriving", async () => {
    await expect(deriveVaultKey("", salt, 1_000, "js")).rejects.toThrow(VaultError);
  });
});
