// Added for Groupon Desk (fork of Paseo, Apache-2.0): the web build's sign-in by redirect.
import { describe, expect, it, vi } from "vitest";
import {
  buildSsoLoginUrl,
  completeSsoCallback,
  isSsoCallback,
  redirectSignInOffered,
  s256Challenge,
  safeReturnPath,
  setSsoReturnPath,
  ssoGatewayUrlFor,
  takeSsoReturnPath,
  type FlowStorage,
} from "./sso-redirect";

const CORE = "https://api-core.livingsocial.com";
const PAGE = "https://desk.livingsocial.com";

function memoryStorage(): FlowStorage & { items: Map<string, string> } {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

/** A JWT whose payload says `exp`; unsigned, the window never verifies it. */
function jwtExpiring(expSeconds: number): string {
  const payload = btoa(JSON.stringify({ exp: expSeconds, userId: "u-1" }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `e30.${payload}.sig`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** One started flow: the gateway address and the tab's storage holding the flow. */
async function startedFlow(returnTo = "/h/server-1?tab=chat") {
  const storage = memoryStorage();
  let n = 0;
  const url = await buildSsoLoginUrl(
    {
      gatewayUrl: "https://sso.livingsocial.com/auth-gateway",
      coreUrl: CORE,
      pageOrigin: PAGE,
      returnTo,
    },
    { storage, random: (length) => `random-${length}-${++n}` },
  );
  return { storage, gateway: new URL(url) };
}

describe("where the redirect is offered (else the device code)", () => {
  it("offers it on the window's two hosted origins against a hosted Core", () => {
    for (const env of ["production", "staging"] as const) {
      expect(redirectSignInOffered("https://desk.livingsocial.com", env)).toBe(true);
      expect(redirectSignInOffered("https://desk.grpn.site", env)).toBe(true);
    }
  });

  it("falls back to the device code on any origin Core's list would refuse", () => {
    expect(redirectSignInOffered("groupon-desk://app", "production")).toBe(false);
    expect(redirectSignInOffered("https://frontend-desk-ts-abc.a.run.app", "production")).toBe(
      false,
    );
    expect(redirectSignInOffered("http://localhost:8082", "production")).toBe(false);
    expect(redirectSignInOffered("http://desk.livingsocial.com", "production")).toBe(false);
    expect(redirectSignInOffered(null, "production")).toBe(false);
    expect(redirectSignInOffered("not an origin", "production")).toBe(false);
  });

  it("offers it on loopback against a local Core, which admits any localhost port", () => {
    expect(redirectSignInOffered("http://localhost:8082", "local")).toBe(true);
    expect(redirectSignInOffered("http://127.0.0.1:3115", "local")).toBe(true);
    expect(redirectSignInOffered("https://desk.livingsocial.com", "local")).toBe(false);
  });
});

describe("the gateway follows the Core", () => {
  it("names each environment's gateway", () => {
    expect(ssoGatewayUrlFor("production", CORE)).toBe("https://sso.livingsocial.com/auth-gateway");
    expect(ssoGatewayUrlFor("staging", "https://api-staging-core.livingsocial.com")).toBe(
      "https://sso.grpn.site/auth-gateway",
    );
  });

  it("puts a local Core's gateway in the same worktree slot", () => {
    expect(ssoGatewayUrlFor("local", "http://localhost:4000")).toBe(
      "http://localhost:3002/auth-gateway",
    );
    expect(ssoGatewayUrlFor("local", "http://localhost:4100")).toBe(
      "http://localhost:3102/auth-gateway",
    );
    expect(ssoGatewayUrlFor("local", "http://localhost:4055")).toBe(
      "http://localhost:3002/auth-gateway",
    );
  });
});

describe("PKCE", () => {
  it("computes the RFC 7636 S256 challenge", async () => {
    await expect(s256Challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
});

describe("starting the sign-in", () => {
  it("sends the tab to the gateway with the callback, the state and the S256 challenge", async () => {
    const { gateway, storage } = await startedFlow();
    expect(gateway.origin + gateway.pathname).toBe("https://sso.livingsocial.com/auth-gateway");
    expect(gateway.searchParams.get("return_url")).toBe(
      "https://desk.livingsocial.com/sso/callback",
    );
    expect(gateway.searchParams.get("code_challenge_method")).toBe("S256");
    const flow = JSON.parse(storage.items.get("groupon-desk.sso-flow") ?? "{}");
    expect(gateway.searchParams.get("state")).toBe(flow.state);
    // The verifier stays in the tab; only its challenge travels.
    expect(gateway.toString()).not.toContain(flow.verifier);
    expect(gateway.searchParams.get("code_challenge")).toBe(await s256Challenge(flow.verifier));
    expect(flow.coreUrl).toBe(CORE);
    expect(flow.returnTo).toBe("/h/server-1?tab=chat");
  });

  it("keeps a verifier of 64 random bytes and a state of 32", async () => {
    const { storage } = await startedFlow();
    const flow = JSON.parse(storage.items.get("groupon-desk.sso-flow") ?? "{}");
    expect(flow.state).toBe("random-32-1");
    expect(flow.verifier).toBe("random-64-2");
  });

  it("uses real randomness by default", async () => {
    const storage = memoryStorage();
    await buildSsoLoginUrl(
      {
        gatewayUrl: "https://sso.livingsocial.com/auth-gateway",
        coreUrl: CORE,
        pageOrigin: PAGE,
        returnTo: "/",
      },
      { storage },
    );
    const flow = JSON.parse(storage.items.get("groupon-desk.sso-flow") ?? "{}");
    expect(flow.verifier).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(flow.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("never returns to the callback itself or off the origin", () => {
    expect(safeReturnPath("/sso/callback?code=x")).toBe("/");
    expect(safeReturnPath("//evil.example/x")).toBe("/");
    expect(safeReturnPath("https://evil.example/")).toBe("/");
    expect(safeReturnPath("")).toBe("/");
    expect(safeReturnPath("/settings/groupon")).toBe("/settings/groupon");
  });
});

describe("the gateway's return", () => {
  it("recognises the callback path only", () => {
    expect(isSsoCallback("https://desk.livingsocial.com/sso/callback?code=a&state=b")).toBe(true);
    expect(isSsoCallback("https://desk.livingsocial.com/h/server-1")).toBe(false);
  });

  it("exchanges the code with the kept verifier at the flow's Core", async () => {
    const { storage, gateway } = await startedFlow();
    const state = gateway.searchParams.get("state");
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: "2026-10-21T12:00:00.000Z",
        user: { userId: "u-1" },
      }),
    );
    const result = await completeSsoCallback(`${PAGE}/sso/callback?code=the-code&state=${state}`, {
      storage,
      fetch: fetchMock,
    });
    expect(result).toEqual({
      kind: "signedIn",
      session: {
        coreUrl: CORE,
        accessToken: "access",
        refreshToken: "refresh",
        accessExpiresAt: "2026-10-21T12:00:00.000Z",
      },
      returnTo: "/h/server-1?tab=chat",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [address, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(address).toBe(`${CORE}/auth/authentication/sso/exchange`);
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "the-code",
      codeVerifier: "random-64-2",
    });
    expect(storage.items.size).toBe(0);
  });

  it("reads the expiry off the access token when Core sends none", async () => {
    const { storage, gateway } = await startedFlow();
    const access = jwtExpiring(1_800_000_000);
    const result = await completeSsoCallback(
      `${PAGE}/sso/callback?code=c&state=${gateway.searchParams.get("state")}`,
      {
        storage,
        fetch: async () => jsonResponse(200, { accessToken: access, refreshToken: "r" }),
      },
    );
    expect(result.kind === "signedIn" && result.session.accessExpiresAt).toBe(
      new Date(1_800_000_000_000).toISOString(),
    );
  });

  it("refuses a state that is not this tab's, without calling Core, and forgets the flow", async () => {
    const { storage } = await startedFlow();
    const fetchMock = vi.fn();
    const result = await completeSsoCallback(`${PAGE}/sso/callback?code=c&state=forged`, {
      storage,
      fetch: fetchMock,
    });
    expect(result.kind).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(storage.items.size).toBe(0);
  });

  it("does nothing on a return no flow waits for (the back button onto a used code)", async () => {
    const storage = memoryStorage();
    const fetchMock = vi.fn();
    const result = await completeSsoCallback(`${PAGE}/sso/callback?code=c&state=s`, {
      storage,
      fetch: fetchMock,
    });
    expect(result).toEqual({ kind: "nothingPending", returnTo: "/" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a flow once: a replay of the same return is not exchanged again", async () => {
    const { storage, gateway } = await startedFlow();
    const href = `${PAGE}/sso/callback?code=c&state=${gateway.searchParams.get("state")}`;
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { accessToken: "a", refreshToken: "r", expiresAt: "x" }),
    );
    await completeSsoCallback(href, { storage, fetch: fetchMock });
    const again = await completeSsoCallback(href, {
      storage,
      fetch: fetchMock,
    });
    expect(again.kind).toBe("nothingPending");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the gateway's error and Core's refusal", async () => {
    const first = await startedFlow();
    const denied = await completeSsoCallback(`${PAGE}/sso/callback?error=access_denied`, {
      storage: first.storage,
      fetch: vi.fn(),
    });
    expect(denied).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("access_denied"),
    });

    const second = await startedFlow();
    const refused = await completeSsoCallback(
      `${PAGE}/sso/callback?code=c&state=${second.gateway.searchParams.get("state")}`,
      {
        storage: second.storage,
        fetch: async () =>
          jsonResponse(400, {
            message: "invalid_grant: request origin does not match return origin",
          }),
      },
    );
    expect(refused).toMatchObject({
      kind: "failed",
      message: expect.stringContaining("invalid_grant"),
      returnTo: "/h/server-1?tab=chat",
    });
  });

  it("refuses an answer without a session, and an unreachable Core", async () => {
    const first = await startedFlow();
    const empty = await completeSsoCallback(
      `${PAGE}/sso/callback?code=c&state=${first.gateway.searchParams.get("state")}`,
      {
        storage: first.storage,
        fetch: async () => jsonResponse(200, { user: {} }),
      },
    );
    expect(empty.kind).toBe("failed");

    const second = await startedFlow();
    const down = await completeSsoCallback(
      `${PAGE}/sso/callback?code=c&state=${second.gateway.searchParams.get("state")}`,
      {
        storage: second.storage,
        fetch: async () => {
          throw new TypeError("network");
        },
      },
    );
    expect(down).toMatchObject({
      kind: "failed",
      message: `Cannot reach Core at ${CORE}.`,
    });
  });
});

describe("the return path after sign-in", () => {
  it("is read once, then the root", () => {
    setSsoReturnPath("/settings/groupon");
    expect(takeSsoReturnPath()).toBe("/settings/groupon");
    expect(takeSsoReturnPath()).toBe("/");
    setSsoReturnPath("//evil.example");
    expect(takeSsoReturnPath()).toBe("/");
  });
});
