// Added for Groupon Desk (fork of Paseo, Apache-2.0): the desktop window opens on this Mac's sign-in, and signs out only itself.
import { createCipheriv, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secrets = new Map<string, string>();
vi.mock("./secure-storage", () => ({
  readSecret: async (key: string) => secrets.get(key) ?? null,
  writeSecret: async (key: string, value: string) => {
    secrets.set(key, value);
  },
  deleteSecret: async (key: string) => {
    secrets.delete(key);
  },
}));
vi.mock("./core-relay", () => ({ setCoreRelayRoute: vi.fn() }));

const { recoverStartupMacSignIn } = await import("./startup-sign-in");

const { useGrouponStore, grouponRequest } = await import("./session");

const PRODUCTION = "https://api-core.livingsocial.com";
const SESSION_KEY = "groupon-desk.session";
const VAULT_KEY_KEY = "groupon-desk.vault-key";

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256" })}.${part(claims)}.signature`;
}

const inMinutes = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();
const macToken = (suffix: string) =>
  jwt({ userId: "user-1", email: "person@groupon.com", n: suffix });

const readDeskSession = vi.fn();
const readDeskVaultKey = vi.fn();
const fetchMock = vi.fn();

function resetStore() {
  useGrouponStore.setState({
    status: "loading",
    environmentId: "production",
    coreUrl: PRODUCTION,
    session: null,
    identity: null,
    sealKey: null,
    deskIdentity: null,
    lastUnlock: null,
  });
}

beforeEach(() => {
  secrets.clear();
  readDeskSession.mockReset();
  readDeskVaultKey.mockReset();
  readDeskVaultKey.mockResolvedValue(null);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("window", { grouponDesk: { readDeskSession, readDeskVaultKey } });
  vi.stubGlobal("fetch", fetchMock);
  resetStore();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the desktop window and this Mac's sign-in", () => {
  it("opens signed in on the Mac's session when the window has none, without a sign-in", async () => {
    readDeskSession.mockResolvedValue({
      accessToken: macToken("a"),
      accessExpiresAt: inMinutes(15),
    });

    await useGrouponStore.getState().hydrate();

    const state = useGrouponStore.getState();
    expect(state.status).toBe("vault");
    expect(state.session).toMatchObject({
      coreUrl: PRODUCTION,
      accessToken: macToken("a"),
      refreshToken: "",
      origin: "mac",
    });
    expect(state.identity?.email).toBe("person@groupon.com");
    expect(fetchMock).not.toHaveBeenCalled();
    // Held in memory only: the window's storage never keeps the Mac's session.
    expect(secrets.has(SESSION_KEY)).toBe(false);
  });

  it("goes straight to ready when the window kept the vault key of the same person", async () => {
    secrets.set(
      VAULT_KEY_KEY,
      JSON.stringify({
        coreUrl: PRODUCTION,
        userId: "user-1",
        key: Buffer.alloc(32, 7).toString("base64"),
      }),
    );
    readDeskSession.mockResolvedValue({
      accessToken: macToken("a"),
      accessExpiresAt: inMinutes(15),
    });

    await useGrouponStore.getState().hydrate();

    expect(useGrouponStore.getState().status).toBe("ready");
  });

  it("keeps the window's own session first", async () => {
    const own = {
      coreUrl: PRODUCTION,
      accessToken: jwt({ userId: "user-2" }),
      refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) + 86_400 }),
      accessExpiresAt: inMinutes(10),
    };
    secrets.set(SESSION_KEY, JSON.stringify(own));

    await useGrouponStore.getState().hydrate();

    expect(useGrouponStore.getState().session).toEqual(own);
    expect(readDeskSession).not.toHaveBeenCalled();
  });

  it("takes the Mac's session when the window's own can no longer be renewed", async () => {
    secrets.set(
      SESSION_KEY,
      JSON.stringify({
        coreUrl: PRODUCTION,
        accessToken: jwt({ userId: "user-1" }),
        refreshToken: jwt({ exp: Math.floor(Date.now() / 1000) - 60 }),
        accessExpiresAt: inMinutes(-30),
      }),
    );
    readDeskSession.mockResolvedValue({
      accessToken: macToken("a"),
      accessExpiresAt: inMinutes(15),
    });

    await useGrouponStore.getState().hydrate();

    expect(useGrouponStore.getState().session?.origin).toBe("mac");
  });

  it("shows the sign-in as today when the Mac has no production sign-in", async () => {
    readDeskSession.mockResolvedValue(null);
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("signedOut");
  });

  it("shows the sign-in as today where there is no bridge (the web build, the phone)", async () => {
    vi.stubGlobal("window", {});
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("signedOut");
  });

  it("asks the Mac again instead of renewing a borrowed token itself", async () => {
    readDeskSession
      .mockResolvedValueOnce({ accessToken: macToken("a"), accessExpiresAt: inMinutes(0.5) })
      .mockResolvedValueOnce({ accessToken: macToken("b"), accessExpiresAt: inMinutes(15) });
    await useGrouponStore.getState().hydrate();

    await grouponRequest("/user/groupon_desk/machines");

    expect(readDeskSession).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PRODUCTION}/user/groupon_desk/machines`);
    expect(url).not.toContain("token/refresh");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${macToken("b")}`);
  });

  it("signs out only the window: its storage is cleared, the Mac's sign-in is never touched", async () => {
    secrets.set(
      "groupon-desk.environment",
      JSON.stringify({ id: "production", coreUrl: PRODUCTION }),
    );
    secrets.set(
      VAULT_KEY_KEY,
      JSON.stringify({ coreUrl: PRODUCTION, userId: "user-1", key: "AAAA" }),
    );
    readDeskSession.mockResolvedValue({
      accessToken: macToken("a"),
      accessExpiresAt: inMinutes(15),
    });
    await useGrouponStore.getState().hydrate();
    // The opened vault publishes the person's identity on the hub; that is not sign-out's doing.
    fetchMock.mockClear();

    await useGrouponStore.getState().signOut();

    expect(useGrouponStore.getState().status).toBe("signedOut");
    expect(useGrouponStore.getState().session).toBeNull();
    expect(secrets.has(SESSION_KEY)).toBe(false);
    expect(secrets.has(VAULT_KEY_KEY)).toBe(false);
    expect(secrets.has("groupon-desk.environment")).toBe(true);
    // The bridge can only read; sign-out made no call to Core and none to the bridge.
    expect(readDeskSession).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Object.keys((window as { grouponDesk: object }).grouponDesk)).toEqual([
      "readDeskSession",
      "readDeskVaultKey",
    ]);
  });
});

/** A vault as Groupon Desk seals it: AES-256-GCM under the vault key, the format as associated data. */
function sealVault(key: Buffer, salt: Buffer, iterations: number): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from("groupon-desk-vault/1"));
  const ciphertext = Buffer.concat([cipher.update('{"secrets":{}}', "utf8"), cipher.final()]);
  return JSON.stringify({
    format: "groupon-desk-vault/1",
    kdf: { name: "PBKDF2-SHA256", iterations, salt: salt.toString("base64") },
    cipher: "AES-256-GCM",
    nonce: nonce.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  });
}

describe("the desktop window and this Mac's kept vault key", () => {
  const key = Buffer.alloc(32, 5);
  const salt = Buffer.from("the-vault-salt");
  const kept = (overrides: Record<string, unknown> = {}) => ({
    userId: "user-1",
    key: key.toString("base64"),
    salt: salt.toString("base64"),
    iterations: 600000,
    ...overrides,
  });

  beforeEach(() => {
    readDeskSession.mockResolvedValue({
      accessToken: macToken("a"),
      accessExpiresAt: inMinutes(15),
    });
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/user/groupon_desk/vault")
        ? new Response(JSON.stringify({ vault: { envelope: sealVault(key, salt, 600000) } }), {
            status: 200,
          })
        : new Response("{}", { status: 200 }),
    );
  });

  it("opens straight to ready with no passphrase, and keeps the key as if typed", async () => {
    readDeskVaultKey.mockResolvedValue(kept());

    await useGrouponStore.getState().hydrate();

    const state = useGrouponStore.getState();
    expect(state.status).toBe("ready");
    expect(state.sealKey).not.toBeNull();
    expect(JSON.parse(secrets.get(VAULT_KEY_KEY) ?? "null")).toEqual({
      coreUrl: PRODUCTION,
      userId: "user-1",
      key: key.toString("base64"),
    });
  });

  it("shows the passphrase step as today when the keychain has no key", async () => {
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("vault");
    expect(secrets.has(VAULT_KEY_KEY)).toBe(false);
  });

  it("ignores another person's key, and a key that does not open the hub's vault", async () => {
    readDeskVaultKey.mockResolvedValue(kept({ userId: "user-9" }));
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("vault");

    resetStore();
    readDeskVaultKey.mockResolvedValue(kept({ key: Buffer.alloc(32, 6).toString("base64") }));
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("vault");

    resetStore();
    readDeskVaultKey.mockResolvedValue(kept({ salt: Buffer.from("other").toString("base64") }));
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("vault");
    expect(secrets.has(VAULT_KEY_KEY)).toBe(false);
  });
});

describe("startup sign-in recovery", () => {
  let stop: (() => void) | undefined;
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    stop?.();
    stop = undefined;
    vi.useRealTimers();
  });

  it("opens without refresh after the Mac's initial session read was unavailable", async () => {
    readDeskSession.mockResolvedValueOnce(null).mockResolvedValue({
      accessToken: macToken("restored"),
      accessExpiresAt: inMinutes(15),
    });
    secrets.set(
      VAULT_KEY_KEY,
      JSON.stringify({
        coreUrl: PRODUCTION,
        userId: "user-1",
        key: Buffer.alloc(32, 7).toString("base64"),
      }),
    );
    await useGrouponStore.getState().hydrate();
    expect(useGrouponStore.getState().status).toBe("signedOut");
    stop = recoverStartupMacSignIn();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(useGrouponStore.getState().status).toBe("ready");
    expect(useGrouponStore.getState().session?.accessToken).toBe(macToken("restored"));
    await useGrouponStore.getState().signOut();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(useGrouponStore.getState().status).toBe("signedOut");
    expect(readDeskSession).toHaveBeenCalledTimes(2);
  });

  it("keeps retrying without overlapping reads and cancels a late response on unmount", async () => {
    readDeskSession.mockResolvedValue(null);
    await useGrouponStore.getState().hydrate();
    let resolve: (value: unknown) => void = () => {};
    readDeskSession.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    stop = recoverStartupMacSignIn();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(readDeskSession).toHaveBeenCalledTimes(2);
    resolve(null);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(readDeskSession).toHaveBeenCalledTimes(3);
    readDeskSession.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(3_000);
    stop();
    resolve({ accessToken: macToken("late"), accessExpiresAt: inMinutes(15) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(useGrouponStore.getState().session).toBeNull();
    expect(readDeskSession).toHaveBeenCalledTimes(4);
  });

  it("keeps a manual sign-in when a Mac response arrives late", async () => {
    readDeskSession.mockResolvedValue(null);
    await useGrouponStore.getState().hydrate();
    let resolve: (value: unknown) => void = () => {};
    readDeskSession.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    stop = recoverStartupMacSignIn();
    await vi.advanceTimersByTimeAsync(3_000);
    await useGrouponStore.getState().acceptApprovedPoll({
      status: "approved",
      accessToken: jwt({ userId: "user-2" }),
      refreshToken: "own-refresh",
      accessTokenExpiresAt: inMinutes(15),
    });
    resolve({ accessToken: macToken("late"), accessExpiresAt: inMinutes(15) });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(useGrouponStore.getState().identity?.userId).toBe("user-2");
    expect(readDeskSession).toHaveBeenCalledTimes(2);
  });
});

describe("an overloaded Core (2026-11-10: 429 on everything)", () => {
  const OWN_REFRESH = jwt({ exp: Math.floor(Date.now() / 1000) + 86_400 });
  const oldToken = jwt({ userId: "user-1", n: "old" });
  const newToken = jwt({ userId: "user-1", n: "new" });

  const isRefresh = (url: string) => url.endsWith("/auth/authentication/token/refresh");
  const refreshes = () => fetchMock.mock.calls.filter(([url]) => isRefresh(url)).length;
  const bearerOf = (init: RequestInit | undefined) =>
    (init?.headers as Record<string, string> | undefined)?.Authorization ?? "";
  const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  async function signedInOwn(accessExpiresAt: string): Promise<void> {
    secrets.set(
      SESSION_KEY,
      JSON.stringify({
        coreUrl: PRODUCTION,
        accessToken: oldToken,
        refreshToken: OWN_REFRESH,
        accessExpiresAt,
      }),
    );
    vi.stubGlobal("window", {});
    await useGrouponStore.getState().hydrate();
  }

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Signing out leaves no back-off behind for the next test.
    await useGrouponStore.getState().signOut();
  });

  it("refreshes once for any number of concurrent 401s, and every caller gets the new token", async () => {
    await signedInOwn(inMinutes(10));
    let answerRefresh: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isRefresh(url)) {
        await new Promise<void>((resolve) => {
          answerRefresh = resolve;
        });
        return json(200, { token: newToken, expiresAt: inMinutes(15) });
      }
      return bearerOf(init) === `Bearer ${newToken}` ? json(200, { ok: url }) : json(401);
    });

    const calls = Array.from({ length: 8 }, (_, i) => grouponRequest(`/user/groupon_desk/r${i}`));
    await vi.waitFor(() => expect(refreshes()).toBe(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    answerRefresh();
    const answers = await Promise.all(calls);

    expect(refreshes()).toBe(1);
    expect(answers).toHaveLength(8);
    expect(useGrouponStore.getState().session?.accessToken).toBe(newToken);
  });

  it("hands a 401 that arrives after the refresh finished the new token, without a second refresh", async () => {
    await signedInOwn(inMinutes(10));
    let answerLate: () => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (isRefresh(url)) return json(200, { token: newToken, expiresAt: inMinutes(15) });
      if (bearerOf(init) === `Bearer ${newToken}`) return json(200, {});
      if (url.endsWith("/late")) {
        await new Promise<void>((resolve) => {
          answerLate = resolve;
        });
      }
      return json(401);
    });

    const late = grouponRequest("/user/groupon_desk/late");
    await grouponRequest("/user/groupon_desk/early");
    answerLate();
    await late;

    expect(refreshes()).toBe(1);
  });

  it("keeps the current token through a refresh Core could not serve, and waits before the next", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await signedInOwn(inMinutes(0.5));
    fetchMock.mockImplementation(async (url: string) =>
      isRefresh(url) ? json(429, { message: "Rate exceeded" }) : json(200, { machines: [] }),
    );

    for (let i = 0; i < 5; i += 1) await grouponRequest("/user/groupon_desk/machines");

    expect(refreshes()).toBe(1);
    expect(useGrouponStore.getState().session?.accessToken).toBe(oldToken);
    // A 429 is no refusal: the window's session stays, nobody is signed out.
    expect(secrets.has(SESSION_KEY)).toBe(true);
    expect(useGrouponStore.getState().status).not.toBe("signedOut");

    // The first back-off is 0.5 s at this draw; after it, one more refresh is allowed.
    vi.setSystemTime(Date.now() + 600);
    await grouponRequest("/user/groupon_desk/machines");
    expect(refreshes()).toBe(2);
  });

  it("fails as busy without asking Core when the token has lapsed and the refresh is backing off", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await signedInOwn(inMinutes(0.5));
    fetchMock.mockImplementation(async (url: string) =>
      isRefresh(url) ? json(503, {}, { "Retry-After": "120" }) : json(200, {}),
    );
    await grouponRequest("/user/groupon_desk/machines");
    fetchMock.mockClear();

    vi.setSystemTime(Date.now() + 60_000);
    await expect(grouponRequest("/user/groupon_desk/machines")).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks a failing endpoint a few times a minute however many polls read it", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    await signedInOwn(inMinutes(60));
    fetchMock.mockImplementation(async () => json(429, { message: "Rate exceeded" }));
    const { startCorePoll } = await import("./core-backoff");
    const overview = () => grouponRequest("/user/groupon_desk/work/overview");

    // Five screens poll the same endpoint every 10 s, as the window's overview readers do.
    const stops = Array.from({ length: 5 }, () =>
      startCorePoll({ run: async () => void (await overview()), intervalMs: 10_000 }),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    const firstMinute = fetchMock.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120_000);
    const nextTwoMinutes = fetchMock.mock.calls.length - firstMinute;
    for (const stop of stops) stop();

    // Before the first answer all five went out; from then on one at a time, by the back-off:
    // 6 requests in the first minute, 2 a minute after it (five polls without the gate: 30 a minute).
    expect(firstMinute).toBe(6);
    expect(nextTwoMinutes).toBe(4);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/work/overview"))).toBe(
      true,
    );
  });
});
