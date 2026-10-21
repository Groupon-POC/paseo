// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's relay client socket carried over Core's relay stream.

/**
 * The phone's path to a Mac: Paseo's relay client, unchanged, with Core as its relay.
 *
 * Core's relay is an Encore stream (`/user/groupon_desk/paseo_relay/stream`), and an Encore
 * stream carries JSON objects only, so Paseo's relay frames ride it wrapped: a text frame as
 * `{kind:"text",data}`, a binary frame as `{kind:"binary",data:<base64>}`, Core's verdict on a
 * socket as `{kind:"close",code,reason}`, and `{kind:"keepalive"}` every 20 s (Core ends a stream
 * that sent nothing for 60 s). On a Mac that runs the hand, its door (monorepo
 * `packages/groupon-cli/src/hand/paseo/relay-door.ts`) does this wrapping; a browser or a phone has
 * no door, so the same translation lives here, as a WebSocket the app's socket factory hands
 * Paseo's relay transport whenever a relay URL names the signed-in Core.
 *
 * Responsibilities:
 * - `coreRelayEndpoint`: Core's address in Paseo's terms (`host:port`, TLS), what a host's relay
 *   connection names when it goes through Core
 * - `coreRelayStreamUrl`: a Paseo relay client URL that names Core, turned into Core's stream URL
 * - `encoreStreamProtocols`: the person's access token in Encore's stream handshake (the
 *   `encore-ws` subprotocol plus the headers as a second one), the one way a browser can send it
 * - `wrapForCore` / `unwrapFromCore`: a frame each way, byte for byte
 * - `CoreRelaySocket` and `withCoreRelay`: the socket, and the factory that picks it
 * - A rollover is no drop: Cloud Run ends every request, a websocket included, at the service's
 *   request timeout (300 s by default), and the socket sees an abnormal close (1006), MEASURED
 *   2026-10-21 on the hand's streams and relay control sockets. A 1006 after
 *   `CORE_RELAY_ROLLOVER_MIN_MS` ends the socket with a reason that starts `Relay rolled over`
 *   (`RELAY_ROLLOVER_REASON_PREFIX` in the fork's client), which the client answers with an
 *   immediate reconnect and no disconnected state; a 1006 sooner is a failure as before
 *
 * Constraints:
 * - Never reads a frame: they are Paseo's end-to-end boxes between this client and the daemon;
 *   Core and this code see ciphertext only, and nothing here logs a frame or the token
 * - Only `role=client` URLs of the signed-in Core are carried; anything else goes to the base
 *   factory untouched
 * - The token goes in the handshake's subprotocol, never in the URL
 */

import type {
  WebSocketFactory,
  WebSocketLike,
} from "@getpaseo/client/internal/daemon-client-transport-types";

export const CORE_RELAY_STREAM_PATH = "/user/groupon_desk/paseo_relay/stream";
/** How often the socket tells Core's stream it is alive; Core ends a silent stream after 60 s. */
export const CORE_RELAY_KEEPALIVE_MS = 20_000;
/**
 * How long a stream must have been open for an abnormal close to count as Cloud Run's request
 * timeout (300 s by default, the service's own setting) rather than a failure.
 */
export const CORE_RELAY_ROLLOVER_MIN_MS = 290_000;
/** The start of the close reason the fork's client reads as a rollover (`RELAY_ROLLOVER_REASON_PREFIX`). */
export const CORE_RELAY_ROLLOVER_REASON = "Relay rolled over";
const ABNORMAL_CLOSE = 1006;
const KEEPALIVE_FRAME = JSON.stringify({ kind: "keepalive" });

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** Where Core is and how to get a fresh access token for it; null while nobody is signed in. */
export interface CoreRelayRoute {
  coreUrl: string;
  accessToken(): Promise<string>;
}

let currentRoute: () => CoreRelayRoute | null = () => null;

/** The session module names the signed-in Core here; the socket factory reads it per socket. */
export function setCoreRelayRoute(route: () => CoreRelayRoute | null): void {
  currentRoute = route;
}

export function coreRelayRoute(): CoreRelayRoute | null {
  return currentRoute();
}

/** Core's address as a Paseo relay endpoint; null for an address that is not http(s). */
export function coreRelayEndpoint(coreUrl: string): { endpoint: string; useTls: boolean } | null {
  let url: URL;
  try {
    url = new URL(coreUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const useTls = url.protocol === "https:";
  return { endpoint: `${url.hostname}:${url.port || (useTls ? "443" : "80")}`, useTls };
}

/**
 * Core's stream URL for a Paseo relay client URL (`ws(s)://<core>/ws?serverId=..&role=client&v=2`)
 * that names this Core; null for any other URL, a daemon's socket among them.
 */
export function coreRelayStreamUrl(relayUrl: string, coreUrl: string): string | null {
  const relay = coreRelayEndpoint(coreUrl);
  if (relay === null) return null;
  let url: URL;
  try {
    url = new URL(relayUrl);
  } catch {
    return null;
  }
  const scheme = relay.useTls ? "wss:" : "ws:";
  const port = url.port || (url.protocol === "wss:" ? "443" : "80");
  if (url.protocol !== scheme || `${url.hostname}:${port}` !== relay.endpoint) return null;
  if (url.pathname !== "/ws" || url.searchParams.get("role") !== "client") return null;
  const target = new URL(CORE_RELAY_STREAM_PATH, coreUrl.replace(/^http/, "ws"));
  for (const key of ["serverId", "role", "v"]) {
    const value = url.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  return target.toString();
}

const base64Url = (text: string): string =>
  btoa(text).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** Encore's stream handshake with the person's token, as Encore's own generated client sends it. */
export function encoreStreamProtocols(token: string): string[] {
  return [
    "encore-ws",
    `encore.dev.headers.${base64Url(JSON.stringify({ Authorization: `Bearer ${token}` }))}`,
  ];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/** One of Paseo's frames as the JSON text Core's stream carries. */
export function wrapForCore(data: string | Uint8Array | ArrayBuffer): string {
  if (typeof data === "string") return JSON.stringify({ kind: "text", data });
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return JSON.stringify({ kind: "binary", data: bytesToBase64(bytes) });
}

export type CoreRelayIncoming =
  | { kind: "text"; data: string }
  | { kind: "binary"; data: ArrayBuffer }
  | { kind: "close"; code: number; reason: string };

/** Core's frame back to Paseo's: text, binary, Core's close, or null for anything else. */
export function unwrapFromCore(text: string): CoreRelayIncoming | null {
  let frame: unknown;
  try {
    frame = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof frame !== "object" || frame === null) return null;
  const { kind, data, code, reason } = frame as Record<string, unknown>;
  if (kind === "text" && typeof data === "string") return { kind, data };
  if (kind === "binary" && typeof data === "string") {
    try {
      return { kind, data: base64ToArrayBuffer(data) };
    } catch {
      return null;
    }
  }
  if (kind === "close") {
    return {
      kind,
      code: typeof code === "number" ? code : 1000,
      reason: typeof reason === "string" ? reason : "",
    };
  }
  return null;
}

/** The slice of a WebSocket the socket opens toward Core (the browser's or React Native's). */
export interface CoreUpstreamSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener: (event: unknown) => void,
  ): void;
}

export type MakeCoreUpstream = (url: string, protocols: string[]) => CoreUpstreamSocket;

const globalUpstream: MakeCoreUpstream = (url, protocols) => new WebSocket(url, protocols);

type EventName = "open" | "message" | "close" | "error";
type Listener = (event: unknown) => void;

const eventField = (event: unknown, field: "data" | "code" | "reason"): unknown =>
  typeof event === "object" && event !== null
    ? (event as Record<string, unknown>)[field]
    : undefined;

/**
 * A WebSocket to Paseo's relay transport, over Core's relay stream: it asks for a fresh token,
 * opens Core's stream with it, and from then on is an ordinary socket to Paseo, its frames
 * wrapped on the way up and unwrapped on the way down. Core's close frame ends it with Core's own
 * code (4403 not your session, 1012 the daemon is gone, 1013 a limit), which Paseo reacts to as
 * it does to relay.paseo.sh's.
 */
export class CoreRelaySocket implements WebSocketLike {
  readyState = CONNECTING;
  binaryType = "arraybuffer";
  readonly #listeners: Record<EventName, Set<Listener>> = {
    open: new Set(),
    message: new Set(),
    close: new Set(),
    error: new Set(),
  };
  #upstream: CoreUpstreamSocket | null = null;
  #keepalive: ReturnType<typeof setInterval> | null = null;
  #ended = false;
  #openedAt: number | null = null;

  constructor(
    streamUrl: string,
    route: CoreRelayRoute,
    makeUpstream: MakeCoreUpstream = globalUpstream,
    keepaliveMs: number = CORE_RELAY_KEEPALIVE_MS,
  ) {
    void this.#open(streamUrl, route, makeUpstream, keepaliveMs);
  }

  addEventListener(event: string, listener: Listener): void {
    this.#listeners[event as EventName]?.add(listener);
  }

  removeEventListener(event: string, listener: Listener): void {
    this.#listeners[event as EventName]?.delete(listener);
  }

  send(data: string | Uint8Array | ArrayBuffer): void {
    if (this.readyState !== OPEN || this.#upstream === null) {
      throw new Error(`WebSocket not open (readyState=${this.readyState})`);
    }
    this.#upstream.send(wrapForCore(data));
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState >= CLOSING) return;
    this.readyState = CLOSING;
    try {
      this.#upstream?.close(1000, reason.slice(0, 120));
    } catch {
      // Already closing; the end below is what Paseo hears.
    }
    setTimeout(() => this.#end(code, reason), 0);
  }

  async #open(
    streamUrl: string,
    route: CoreRelayRoute,
    makeUpstream: MakeCoreUpstream,
    keepaliveMs: number,
  ): Promise<void> {
    let token: string;
    try {
      token = await route.accessToken();
    } catch {
      this.#emit("error", { type: "error" });
      this.#end(1011, "Not signed in to Groupon");
      return;
    }
    if (this.readyState !== CONNECTING) return;
    const upstream = makeUpstream(streamUrl, encoreStreamProtocols(token));
    this.#upstream = upstream;
    upstream.addEventListener("open", () => {
      if (this.readyState !== CONNECTING) {
        upstream.close(1000, "Closed while connecting");
        return;
      }
      this.readyState = OPEN;
      this.#openedAt = Date.now();
      this.#keepalive = setInterval(() => {
        if (upstream.readyState === OPEN) upstream.send(KEEPALIVE_FRAME);
      }, keepaliveMs);
      this.#emit("open", { type: "open" });
    });
    upstream.addEventListener("message", (event) => {
      const text = eventField(event, "data");
      if (typeof text !== "string" || this.readyState !== OPEN) return;
      const frame = unwrapFromCore(text);
      if (frame === null) return;
      if (frame.kind === "close") {
        this.readyState = CLOSING;
        upstream.close(1000, "Closed by Core's relay");
        this.#end(frame.code, frame.reason);
        return;
      }
      this.#emit("message", { type: "message", data: frame.data });
    });
    upstream.addEventListener("error", () => this.#emit("error", { type: "error" }));
    upstream.addEventListener("close", (event) => {
      const code = eventField(event, "code");
      const reason = eventField(event, "reason");
      const closeCode = typeof code === "number" ? code : ABNORMAL_CLOSE;
      const lived = this.#openedAt === null ? 0 : Date.now() - this.#openedAt;
      if (closeCode === ABNORMAL_CLOSE && lived >= CORE_RELAY_ROLLOVER_MIN_MS) {
        this.#end(closeCode, `${CORE_RELAY_ROLLOVER_REASON} after ${Math.round(lived / 1000)} s`);
        return;
      }
      this.#end(closeCode, typeof reason === "string" ? reason : "Relay stream ended");
    });
  }

  #end(code: number, reason: string): void {
    if (this.#ended) return;
    this.#ended = true;
    this.readyState = CLOSED;
    if (this.#keepalive !== null) clearInterval(this.#keepalive);
    this.#keepalive = null;
    this.#emit("close", { type: "close", code, reason, wasClean: code === 1000 });
  }

  #emit(event: EventName, payload: unknown): void {
    for (const listener of this.#listeners[event]) listener(payload);
  }
}

/**
 * The app's socket factory with Core as the relay: a relay client URL that names the signed-in
 * Core becomes a `CoreRelaySocket`; every other URL goes to `base` as before.
 */
export function withCoreRelay(
  base: WebSocketFactory,
  route: () => CoreRelayRoute | null = coreRelayRoute,
  makeUpstream: MakeCoreUpstream = globalUpstream,
): WebSocketFactory {
  return (url, options) => {
    const current = route();
    const streamUrl = current === null ? null : coreRelayStreamUrl(url, current.coreUrl);
    if (current === null || streamUrl === null) return base(url, options);
    return new CoreRelaySocket(streamUrl, current, makeUpstream);
  };
}
