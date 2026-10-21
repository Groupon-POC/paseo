// Added for Groupon Desk (fork of Paseo, Apache-2.0): the web build's sign-in as a redirect to Groupon's SSO gateway and back.

/**
 * The web build (desk.livingsocial.com, desk.grpn.site) signs in the way every other Groupon
 * frontend does: the window sends the tab to the SSO gateway's `/auth-gateway` with a PKCE
 * challenge and a return address, the gateway sends it back to `/sso/callback` with a one-time
 * code, and the window exchanges the code at Core for the session (owner, 2026-10-21: the device
 * code's second tab had to be closed by hand on a phone).
 *
 * The three pieces are copied from the monorepo's `@groupon2/frontend-sso-client`, which the Expo
 * build cannot import (another repository): `pkce.ts` (the verifier, the S256 challenge),
 * `loginWithSso.ts` (`buildSsoLoginUrl`: the gateway's query, `return_url`, `state`,
 * `code_challenge`, `code_challenge_method=S256`) and `handleSsoCallback.ts` (state checked
 * against the tab's sessionStorage, then `POST /auth/authentication/sso/exchange` with
 * `{ code, codeVerifier }`). The contract is the gateway's and Core's, not this file's: Core binds
 * the code to the return origin and admits only the origins on its `SSO_ALLOWED_ORIGINS` (the
 * estate table's frontends, both environments).
 *
 * Constraints:
 * - Offered only on a page origin Core's list admits (`redirectSignInOffered`); anywhere else (the
 *   Electron window, a phone app, a preview host) the device code stays the way in
 * - The verifier and state live in the tab's sessionStorage only, and are deleted on the first
 *   callback that reads them, matching or not
 * - Nothing here logs a code, a verifier or a token
 */

import { expiryOf } from "./core-client";
import { GROUPON_DESK_WEB_URL, type GrouponEnvironmentId } from "./environments";

/** The window's own route the gateway sends the tab back to. */
export const SSO_CALLBACK_PATH = "/sso/callback";

/**
 * The SSO gateway in front of each Core (the monorepo's estate table, row `sso`). A code is minted
 * by the gateway's Core and only that Core can exchange it, so the gateway follows the Core the
 * window signs in to, never the host the window is served from.
 */
export const SSO_GATEWAY_URL: Readonly<Record<GrouponEnvironmentId, string>> = {
  production: "https://sso.livingsocial.com/auth-gateway",
  staging: "https://sso.grpn.site/auth-gateway",
  local: "http://localhost:3002/auth-gateway",
};

const LOCAL_CORE_PORT = 4000;
const LOCAL_GATEWAY_PORT = 3002;

/**
 * The gateway for a Core. A local Core in a worktree slot (4100, 4200, ...) has its gateway in the
 * same slot (3102, 3202, ...), the monorepo's slot rule.
 */
export function ssoGatewayUrlFor(environmentId: GrouponEnvironmentId, coreUrl: string): string {
  if (environmentId !== "local") return SSO_GATEWAY_URL[environmentId];
  let port = LOCAL_CORE_PORT;
  try {
    port = Number(new URL(coreUrl).port || LOCAL_CORE_PORT);
  } catch {
    // An unreadable address keeps the primary checkout's pair.
  }
  const offset = port - LOCAL_CORE_PORT;
  const gatewayPort =
    offset >= 0 && offset % 100 === 0 ? LOCAL_GATEWAY_PORT + offset : LOCAL_GATEWAY_PORT;
  return `http://localhost:${gatewayPort}/auth-gateway`;
}

const HOSTED_WINDOW_ORIGINS = new Set([
  new URL(GROUPON_DESK_WEB_URL.production).origin,
  new URL(GROUPON_DESK_WEB_URL.staging).origin,
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1"]);

/**
 * Whether the window may sign in by redirect from `pageOrigin`. A hosted Core admits the window's
 * two hosted origins (its list is every estate frontend of both environments); a local Core admits
 * any loopback origin. Any other origin (a `groupon-desk://` window, a preview host, a phone app
 * with no page) gets the device code, because the gateway would refuse the return address and stop
 * on its own error page, never coming back to say so.
 */
export function redirectSignInOffered(
  pageOrigin: string | null,
  environmentId: GrouponEnvironmentId,
): boolean {
  if (!pageOrigin) return false;
  let url: URL;
  try {
    url = new URL(pageOrigin);
  } catch {
    return false;
  }
  if (environmentId === "local") {
    return (
      (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname)
    );
  }
  return HOSTED_WINDOW_ORIGINS.has(url.origin);
}

// --- PKCE, copied from `@groupon2/frontend-sso-client` `pkce.ts` ------------------------------

const BASE64_URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function bytesToBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triplet = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += BASE64_URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += BASE64_URL_ALPHABET[(triplet >> 12) & 0x3f];
    out += BASE64_URL_ALPHABET[(triplet >> 6) & 0x3f];
    out += BASE64_URL_ALPHABET[triplet & 0x3f];
  }
  if (i < bytes.length) {
    const remaining = bytes.length - i;
    let triplet = (bytes[i] ?? 0) << 16;
    if (remaining === 2) triplet |= (bytes[i + 1] ?? 0) << 8;
    out += BASE64_URL_ALPHABET[(triplet >> 18) & 0x3f];
    out += BASE64_URL_ALPHABET[(triplet >> 12) & 0x3f];
    if (remaining === 2) out += BASE64_URL_ALPHABET[(triplet >> 6) & 0x3f];
  }
  return out;
}

/** `length` random bytes as base64url, no padding (32 bytes give 43 characters). */
export function randomBase64Url(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/** The PKCE S256 challenge, `base64url(SHA-256(verifier))`, the only method Core accepts. */
export async function s256Challenge(verifier: string): Promise<string> {
  if (!crypto.subtle) {
    throw new Error("Sign-in requires a secure context (HTTPS or localhost).");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}

// --- The flow's state, in the tab's sessionStorage ----------------------------------------------

/** The part of `Storage` the flow uses; the tab's `sessionStorage` in the app, a map in tests. */
export interface FlowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const FLOW_KEY = "groupon-desk.sso-flow";

/** What one sign-in leaves in the tab until the gateway sends it back. */
export interface SsoFlowState {
  state: string;
  verifier: string;
  /** The Core the code is exchanged at: the one the person signed in to when they pressed. */
  coreUrl: string;
  /** Where in the window to land afterwards (path, query and hash). */
  returnTo: string;
}

function parseFlow(raw: string | null): SsoFlowState | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { state, verifier, coreUrl, returnTo } = value as Record<string, unknown>;
    if (typeof state !== "string" || typeof verifier !== "string") return null;
    if (typeof coreUrl !== "string" || typeof returnTo !== "string") return null;
    return { state, verifier, coreUrl, returnTo };
  } catch {
    return null;
  }
}

/** A path inside the window to come back to: same origin, never the callback itself. */
export function safeReturnPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//")) return "/";
  if (path === SSO_CALLBACK_PATH || path.startsWith(`${SSO_CALLBACK_PATH}?`)) return "/";
  if (path.startsWith(`${SSO_CALLBACK_PATH}#`)) return "/";
  return path;
}

export interface SsoLoginInput {
  gatewayUrl: string;
  coreUrl: string;
  /** The window's origin, `https://desk.livingsocial.com`. */
  pageOrigin: string;
  /** Path, query and hash of the page the person pressed Sign in on. */
  returnTo: string;
}

export interface SsoLoginDeps {
  storage: FlowStorage;
  random: (length: number) => string;
  challenge: (verifier: string) => Promise<string>;
}

const DEFAULT_LOGIN_DEPS: Omit<SsoLoginDeps, "storage"> = {
  random: randomBase64Url,
  challenge: s256Challenge,
};

/**
 * The gateway address that starts one sign-in, with the flow's state kept in the tab: the copy of
 * `buildSsoLoginUrl`. A second press replaces the first flow's state, so only the latest return
 * is accepted.
 */
export async function buildSsoLoginUrl(
  input: SsoLoginInput,
  deps: Pick<SsoLoginDeps, "storage"> & Partial<SsoLoginDeps>,
): Promise<string> {
  const random = deps.random ?? DEFAULT_LOGIN_DEPS.random;
  const challengeOf = deps.challenge ?? DEFAULT_LOGIN_DEPS.challenge;
  const state = random(32);
  const verifier = random(64);
  const challenge = await challengeOf(verifier);
  const flow: SsoFlowState = {
    state,
    verifier,
    coreUrl: input.coreUrl,
    returnTo: safeReturnPath(input.returnTo),
  };
  deps.storage.setItem(FLOW_KEY, JSON.stringify(flow));

  const gateway = new URL(input.gatewayUrl);
  gateway.searchParams.set("return_url", new URL(SSO_CALLBACK_PATH, input.pageOrigin).toString());
  gateway.searchParams.set("state", state);
  gateway.searchParams.set("code_challenge", challenge);
  gateway.searchParams.set("code_challenge_method", "S256");
  return gateway.toString();
}

/** Whether `href` is the gateway's return to the window. */
export function isSsoCallback(href: string): boolean {
  try {
    return new URL(href).pathname === SSO_CALLBACK_PATH;
  } catch {
    return false;
  }
}

/** The session the exchange gave, in the shape the gate keeps (`session.ts`' `GrouponSession`). */
export interface SsoSession {
  coreUrl: string;
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
}

export type SsoCallbackResult =
  | { kind: "signedIn"; session: SsoSession; returnTo: string }
  /** No flow is waiting in this tab: the back button onto a used return, nothing to do. */
  | { kind: "nothingPending"; returnTo: string }
  | { kind: "failed"; message: string; returnTo: string };

export interface SsoCallbackDeps {
  storage: FlowStorage;
  fetch: typeof fetch;
}

function messageOfBody(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const { message, error } = body as Record<string, unknown>;
  if (typeof message === "string" && message) return message;
  if (typeof error === "string" && error) return error;
  return null;
}

/** The exchange's answer as a session, or null when a field is missing. */
function sessionOf(body: unknown, coreUrl: string): SsoSession | null {
  if (typeof body !== "object" || body === null) return null;
  const { accessToken, refreshToken, expiresAt } = body as Record<string, unknown>;
  if (typeof accessToken !== "string" || accessToken === "") return null;
  if (typeof refreshToken !== "string" || refreshToken === "") return null;
  let accessExpiresAt = typeof expiresAt === "string" && expiresAt ? expiresAt : null;
  if (!accessExpiresAt) {
    const fromToken = expiryOf(accessToken);
    accessExpiresAt = fromToken === null ? null : new Date(fromToken).toISOString();
  }
  if (!accessExpiresAt) return null;
  return { coreUrl, accessToken, refreshToken, accessExpiresAt };
}

/**
 * The gateway's return: checks `state` against the tab's flow (then forgets the flow, whatever
 * the answer), and exchanges `code` with the kept verifier at the Core the flow began on. The copy
 * of `handleSsoCallback`, returning instead of throwing so the gate can show the reason beside the
 * sign-in button.
 */
export async function completeSsoCallback(
  href: string,
  deps: SsoCallbackDeps,
): Promise<SsoCallbackResult> {
  const flow = parseFlow(deps.storage.getItem(FLOW_KEY));
  deps.storage.removeItem(FLOW_KEY);
  const returnTo = flow?.returnTo ?? "/";
  if (!flow) return { kind: "nothingPending", returnTo };

  const url = new URL(href);
  const gatewayError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (gatewayError) {
    return {
      kind: "failed",
      message: `Groupon's sign-in answered: ${gatewayError}.`,
      returnTo,
    };
  }
  if (!code || !state) {
    return {
      kind: "failed",
      message: "Groupon's sign-in came back without a code.",
      returnTo,
    };
  }
  if (state !== flow.state) {
    return {
      kind: "failed",
      message: "This sign-in was started in another tab or has expired. Sign in again.",
      returnTo,
    };
  }

  let response: Response;
  try {
    response = await deps.fetch(`${flow.coreUrl}/auth/authentication/sso/exchange`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ code, codeVerifier: flow.verifier }),
    });
  } catch {
    return {
      kind: "failed",
      message: `Cannot reach Core at ${flow.coreUrl}.`,
      returnTo,
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = messageOfBody(body) ?? `Core answered ${response.status}`;
    return {
      kind: "failed",
      message: `The sign-in could not be completed: ${detail}`,
      returnTo,
    };
  }
  const session = sessionOf(body, flow.coreUrl);
  if (!session) {
    return {
      kind: "failed",
      message: "Core completed the sign-in without a session.",
      returnTo,
    };
  }
  return { kind: "signedIn", session, returnTo };
}

/**
 * Where the `/sso/callback` route sends the router once the gate lets the app in: the page the
 * person pressed Sign in on. Set by the gate's callback step, read once by the route.
 */
let pendingReturnPath = "/";

export function setSsoReturnPath(path: string): void {
  pendingReturnPath = safeReturnPath(path);
}

export function takeSsoReturnPath(): string {
  const path = pendingReturnPath;
  pendingReturnPath = "/";
  return path;
}
