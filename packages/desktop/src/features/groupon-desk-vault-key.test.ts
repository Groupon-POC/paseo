// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for lending this Mac's kept vault key to the window.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRODUCTION_CORE_URL } from "./groupon-desk-session";
import {
  parseKeptVaultKey,
  resolveDeskVaultKey,
  userIdOfToken,
  VAULT_KEY_KEYCHAIN_SERVICE,
} from "./groupon-desk-vault-key";

const KEY = Buffer.alloc(32, 9).toString("base64");
const SALT = Buffer.from("salt-of-the-vault").toString("base64");
const KEPT = `${KEY}:${SALT}:600000`;

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.signature`;
}

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "groupon-desk-vault-key-"));
  file = path.join(dir, "groupon", "credentials");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      credentials: {
        [PRODUCTION_CORE_URL]: {
          type: "session",
          accessToken: jwt({ userId: "user-1", email: "person@groupon.com" }),
          refreshToken: "refresh",
          accessExpiresAt: "2026-10-20T12:15:00.000Z",
          createdAt: "2026-10-20T12:00:00.000Z",
        },
      },
    }),
  );
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function deps(readKeychainItem: (service: string, account: string) => Promise<string | null>) {
  return { file, coreUrl: PRODUCTION_CORE_URL, platform: "darwin" as const, readKeychainItem };
}

describe("resolveDeskVaultKey", () => {
  it("reads the item kept for the user this Mac is signed in as", async () => {
    const security = vi.fn(async () => KEPT);
    expect(await resolveDeskVaultKey(deps(security))).toEqual({
      userId: "user-1",
      key: KEY,
      salt: SALT,
      iterations: 600000,
    });
    expect(security).toHaveBeenCalledWith(VAULT_KEY_KEYCHAIN_SERVICE, "user-1");
  });

  it("reads a value `security -w` printed in hex", async () => {
    const hex = Buffer.from(KEPT, "utf8").toString("hex");
    expect((await resolveDeskVaultKey(deps(async () => hex)))?.key).toBe(KEY);
  });

  it("is null when the keychain has no key (a Mac without a hand)", async () => {
    expect(await resolveDeskVaultKey(deps(async () => null))).toBeNull();
  });

  it("is null for a malformed keychain value", async () => {
    for (const value of [
      "",
      "not-a-key",
      `${KEY}:${SALT}`,
      `short:${SALT}:600000`,
      `${KEY}:${SALT}:0`,
    ]) {
      expect(await resolveDeskVaultKey(deps(async () => value))).toBeNull();
    }
  });

  it("asks the keychain nothing when the Mac has no production sign-in, or off macOS", async () => {
    const security = vi.fn(async () => KEPT);
    await writeFile(file, JSON.stringify({ version: 1, credentials: {} }));
    expect(await resolveDeskVaultKey(deps(security))).toBeNull();
    expect(await resolveDeskVaultKey({ ...deps(security), platform: "linux" })).toBeNull();
    expect(security).not.toHaveBeenCalled();
  });
});

describe("parseKeptVaultKey and userIdOfToken", () => {
  it("keep the CLI's rules", () => {
    expect(parseKeptVaultKey(null)).toBeNull();
    expect(parseKeptVaultKey(` ${KEPT}\n`)?.iterations).toBe(600000);
    expect(userIdOfToken(jwt({ sub: "user-2" }))).toBe("user-2");
    expect(userIdOfToken("not-a-jwt")).toBeNull();
  });
});
