// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for lending this Mac's sign-in to the window.
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  deskCredentialsPath,
  isDeskSessionCaller,
  PRODUCTION_CORE_URL,
  readDeskSessionEntry,
  resolveDeskSession,
} from "./groupon-desk-session";

const NOW = Date.parse("2026-10-20T12:00:00.000Z");
const LATER = "2026-10-20T12:15:00.000Z";
const SOON = "2026-10-20T12:00:30.000Z";

let configHome: string;
let file: string;

function sessionEntry(accessExpiresAt: string, suffix = "1") {
  return {
    type: "session",
    accessToken: `access-${suffix}`,
    refreshToken: `refresh-${suffix}`,
    accessExpiresAt,
    createdAt: "2026-10-20T11:45:00.000Z",
  };
}

async function writeCredentials(credentials: Record<string, unknown>, version = 1) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ version, credentials }), { mode: 0o600 });
}

const failingFetch = vi.fn(async () => {
  throw new Error("no network in this test");
}) as unknown as typeof fetch;

function deps(overrides: Partial<Parameters<typeof resolveDeskSession>[0]> = {}) {
  return {
    file,
    coreUrl: PRODUCTION_CORE_URL,
    now: () => NOW,
    fetch: failingFetch,
    freshForMs: 60_000,
    ...overrides,
  };
}

beforeEach(async () => {
  configHome = await mkdtemp(path.join(tmpdir(), "groupon-desk-session-"));
  file = deskCredentialsPath({ XDG_CONFIG_HOME: configHome }, "/nowhere");
});

afterEach(async () => {
  await rm(configHome, { recursive: true, force: true });
});

describe("deskCredentialsPath", () => {
  it("is the CLI's file under XDG_CONFIG_HOME, else under ~/.config", () => {
    expect(deskCredentialsPath({ XDG_CONFIG_HOME: "/x" }, "/home/me")).toBe(
      "/x/groupon/credentials",
    );
    expect(deskCredentialsPath({}, "/home/me")).toBe("/home/me/.config/groupon/credentials");
    expect(deskCredentialsPath({ XDG_CONFIG_HOME: "  " }, "/home/me")).toBe(
      "/home/me/.config/groupon/credentials",
    );
  });
});

describe("readDeskSessionEntry", () => {
  it("reads the production entry by its normalised Core URL, not another Core's", async () => {
    await writeCredentials({
      "https://api-staging-core.livingsocial.com": sessionEntry(LATER, "staging"),
      "https://api-core.livingsocial.com": sessionEntry(LATER, "production"),
    });
    expect(await readDeskSessionEntry(file, `${PRODUCTION_CORE_URL}/`)).toEqual({
      accessToken: "access-production",
      refreshToken: "refresh-production",
      accessExpiresAt: LATER,
    });
  });

  it("is null when the file has no production entry", async () => {
    await writeCredentials({
      "https://api-staging-core.livingsocial.com": sessionEntry(LATER, "staging"),
    });
    expect(await readDeskSessionEntry(file, PRODUCTION_CORE_URL)).toBeNull();
  });

  it("is null when there is no file", async () => {
    expect(await readDeskSessionEntry(file, PRODUCTION_CORE_URL)).toBeNull();
  });

  it("is null for a malformed file, another version, or a legacy token entry", async () => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{not json");
    expect(await readDeskSessionEntry(file, PRODUCTION_CORE_URL)).toBeNull();

    await writeCredentials({ [PRODUCTION_CORE_URL]: sessionEntry(LATER) }, 2);
    expect(await readDeskSessionEntry(file, PRODUCTION_CORE_URL)).toBeNull();

    await writeCredentials({ [PRODUCTION_CORE_URL]: { token: "grpn_x", expiresAt: null } });
    expect(await readDeskSessionEntry(file, PRODUCTION_CORE_URL)).toBeNull();
  });
});

describe("resolveDeskSession", () => {
  it("hands out a fresh access token and its expiry, never the refresh token", async () => {
    await writeCredentials({ [PRODUCTION_CORE_URL]: sessionEntry(LATER) });
    const session = await resolveDeskSession(deps());
    expect(session).toEqual({ accessToken: "access-1", accessExpiresAt: LATER });
    expect(failingFetch).not.toHaveBeenCalled();
  });

  it("renews a stale token under the CLI's lock and writes it back in the CLI's format", async () => {
    await writeCredentials({
      [PRODUCTION_CORE_URL]: sessionEntry(SOON),
      "http://localhost:4100": sessionEntry(LATER, "local"),
    });
    const renewFetch = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toEqual({ token: "refresh-1" });
      await expect(stat(`${file}.refresh.lock`)).resolves.toBeTruthy();
      return new Response(
        JSON.stringify({ token: "access-2", expiresAt: LATER, refreshTokenValue: "refresh-2" }),
        { status: 200 },
      );
    });

    const session = await resolveDeskSession(
      deps({ fetch: renewFetch as unknown as typeof fetch }),
    );

    expect(session).toEqual({ accessToken: "access-2", accessExpiresAt: LATER });
    expect(renewFetch).toHaveBeenCalledWith(
      `${PRODUCTION_CORE_URL}/auth/authentication/token/refresh`,
      expect.objectContaining({ method: "POST" }),
    );
    const written = JSON.parse(await readFile(file, "utf8"));
    expect(written.version).toBe(1);
    expect(written.credentials[PRODUCTION_CORE_URL]).toMatchObject({
      type: "session",
      accessToken: "access-2",
      refreshToken: "refresh-2",
      accessExpiresAt: LATER,
    });
    expect(written.credentials["http://localhost:4100"]).toEqual(sessionEntry(LATER, "local"));
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    await expect(stat(`${file}.refresh.lock`)).rejects.toThrow();
  });

  it("leaves the file alone and lends nothing when Core refuses an expired session", async () => {
    await writeCredentials({ [PRODUCTION_CORE_URL]: sessionEntry("2026-10-20T11:00:00.000Z") });
    const before = await readFile(file, "utf8");
    const refuse = vi.fn(async () => new Response("{}", { status: 401 }));
    expect(await resolveDeskSession(deps({ fetch: refuse as unknown as typeof fetch }))).toBeNull();
    expect(await readFile(file, "utf8")).toBe(before);
  });

  it("never renews while another process holds the lock", async () => {
    await writeCredentials({ [PRODUCTION_CORE_URL]: sessionEntry(SOON) });
    await writeFile(`${file}.refresh.lock`, "");
    const session = await resolveDeskSession(deps({ lockWaitMs: 200 }));
    expect(failingFetch).not.toHaveBeenCalled();
    // Still good for 30 s, so the window may use it until the holder writes the renewed one.
    expect(session).toEqual({ accessToken: "access-1", accessExpiresAt: SOON });
  });
});

describe("isDeskSessionCaller", () => {
  it("admits the window's own pages and, in development, the dev server", () => {
    expect(isDeskSessionCaller("groupon-desk://app/", "groupon-desk", null)).toBe(true);
    expect(isDeskSessionCaller("groupon-desk://app/settings", "groupon-desk", null)).toBe(true);
    expect(
      isDeskSessionCaller("http://localhost:8081/", "groupon-desk", "http://localhost:8081"),
    ).toBe(true);
  });

  it("refuses any other page", () => {
    expect(isDeskSessionCaller("https://example.com/", "groupon-desk", null)).toBe(false);
    expect(isDeskSessionCaller("http://localhost:8081/", "groupon-desk", null)).toBe(false);
    expect(isDeskSessionCaller("groupon-desk://evil/", "groupon-desk", null)).toBe(false);
    expect(isDeskSessionCaller("paseo://app/", "groupon-desk", null)).toBe(false);
    expect(isDeskSessionCaller(undefined, "groupon-desk", null)).toBe(false);
  });
});
