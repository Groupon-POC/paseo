// Added for Groupon Desk (fork of Paseo, Apache-2.0): the few Core endpoints the app calls.

/**
 * Groupon's Core over plain fetch: the device sign-in the `groupon` CLI uses
 * (`POST /auth/device_auth/start` and `poll`; monorepo `packages/groupon-cli/src/auth/login.ts`),
 * the token refresh with the refresh JWT in the body (the browser's way, which native fetch shares),
 * and the hub's reads (`/user/groupon_desk/...`). Bodies that carry a credential are never logged.
 */

export class CoreError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessageOf(body: unknown, status: number): string {
  if (
    body &&
    typeof body === "object" &&
    typeof (body as { message?: unknown }).message === "string"
  ) {
    return (body as { message: string }).message;
  }
  return `Core answered ${status}`;
}

export async function coreRequest<T>(
  coreUrl: string,
  path: string,
  init: { method?: "GET" | "POST" | "PUT"; body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  let response: Response;
  try {
    response = await fetch(`${coreUrl}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new CoreError(`Cannot reach Core at ${coreUrl}.`, null);
  }
  const body = await readJson(response);
  if (!response.ok) throw new CoreError(errorMessageOf(body, response.status), response.status);
  return body as T;
}

export interface DeviceAuthStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresIn: number;
  pollIntervalSeconds: number;
}

export interface DeviceAuthPoll {
  status: "pending" | "approved" | "denied" | "expired";
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: string;
}

export function deviceAuthStart(coreUrl: string, name: string): Promise<DeviceAuthStart> {
  return coreRequest(coreUrl, "/auth/device_auth/start", { method: "POST", body: { name } });
}

export function deviceAuthPoll(coreUrl: string, deviceCode: string): Promise<DeviceAuthPoll> {
  return coreRequest(coreUrl, "/auth/device_auth/poll", { method: "POST", body: { deviceCode } });
}

export interface TokenRefresh {
  token: string;
  expiresAt: string;
  refreshTokenValue?: string;
}

export function tokenRefresh(coreUrl: string, refreshToken: string): Promise<TokenRefresh> {
  return coreRequest(coreUrl, "/auth/authentication/token/refresh", {
    method: "POST",
    body: { token: refreshToken },
  });
}

/** Who a Core access token names, read from its payload unverified: for display only. */
export interface TokenIdentity {
  userId: string | null;
  email: string | null;
  name: string | null;
}

/** A JWT's payload, unverified; null when the token is no JWT. */
function payloadOf(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split(".")[1] ?? "";
    const padded = segment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const payload: unknown = JSON.parse(atob(padded));
    return typeof payload === "object" && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function identityOf(accessToken: string): TokenIdentity {
  const payload = payloadOf(accessToken);
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return {
    userId: text(payload?.userId ?? payload?.sub),
    email: text(payload?.email),
    name: text(payload?.name),
  };
}

/** When a JWT says it lapses (its `exp`, in milliseconds), unverified; null when it says nothing. */
export function expiryOf(token: string): number | null {
  const exp = payloadOf(token)?.exp;
  return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
}
