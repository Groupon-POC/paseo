// Added for Groupon Desk (fork of Paseo, Apache-2.0): the desktop window opens on this Mac's sign-in, and signs out only itself.
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
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("window", { grouponDesk: { readDeskSession } });
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
    ]);
  });
});
