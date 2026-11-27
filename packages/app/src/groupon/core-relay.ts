// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's relay client socket carried over the realtime server's relay.

/**
 * The phone's path to a Mac: Paseo's relay client, unchanged, with Groupon's realtime server as
 * its relay (`apps/backend-realtime-ts` in the Groupon monorepo, its wire contract
 * `packages/desk-relay/src/realtime-contract.ts`). Core only mints the ticket that opens a socket.
 *
 * The server's relay socket is `<realtime>/relay/v2?serverId=&role=client&v=2`, opened with two
 * subprotocols, `grpn-ws.v1` (echoed) and `ticket.<ticket>`, the ticket Core signs for one socket
 * (`POST /user/groupon_desk/paseo_relay/ticket` `{ serverId, role, connectionId? }`, valid 60 s and
 * once). Its frames are Core's relay stream's, JSON-wrapped: a text frame as `{kind:"text",data}`,
 * a binary frame as `{kind:"binary",data:<base64>}`, the relay's verdict on a socket as
 * `{kind:"close",code,reason}` before the close itself. On a Mac that runs the hand, its door
 * (monorepo `packages/groupon-cli/src/hand/paseo/relay-door.ts`) does this wrapping; a browser or a
 * phone has no door, so the same translation lives here, as a WebSocket the app's socket factory
 * hands Paseo's relay transport whenever a relay URL names the signed-in Core.
 *
 * Responsibilities:
 * - `coreRelayEndpoint`: Core's address in Paseo's terms (`host:port`, TLS), what a host's relay
 *   connection names (`hub-sync.tsx`); a relay URL naming it is the marker this factory routes
 * - `realtimeRelayTarget`: such a Paseo relay client URL turned into the realtime server's relay
 *   socket and the ticket request for it
 * - `realtimeRelayProtocols`: the ticket in the handshake's subprotocol, the one way a browser can
 *   send it
 * - `wrapForCore` / `unwrapFromCore`: a frame each way, byte for byte
 * - `CoreRelaySocket` and `withCoreRelay`: the socket, and the factory that picks it
 * - Close codes: 1012 `Server restarting` (a deploy or an eviction, the next pod already serves)
 *   ends the socket with a reason that starts `Relay rolled over` (`RELAY_ROLLOVER_REASON_PREFIX`
 *   in the fork's client), which the client answers with an immediate reconnect and no
 *   disconnected state, and clears this Mac's back-off so the next socket opens at once. 4401 (the
 *   ticket refused, or the session revoked) is a failure like any other: every socket asks Core
 *   for a ticket of its own before it opens, so the reconnect Paseo makes carries a new one. Paseo's
 *   own codes (1012 `Server disconnected` the daemon went, 4403, 1013) reach the client as they are
 * - Each relay socket URL (one per Mac) waits its back-off (`core-backoff.ts`) before it asks Core
 *   for a ticket: every end of a socket counts as a failure, and one that stayed up 30 s first
 *   starts the count over, so a relay that refuses or drops every socket is asked ever more
 *   slowly, up to a minute apart. The wait sits under Paseo's own reconnect timer (1.5 s doubling
 *   to 30 s, no jitter), which this socket cannot see; a close Paseo asked for on an open socket
 *   counts for nothing
 *
 * Constraints:
 * - Never reads a frame: they are Paseo's end-to-end boxes between this client and the daemon;
 *   the relay and this code see ciphertext only, and nothing here logs a frame
 * - The ticket rides the subprotocol only: never the URL, a log or a close reason; a ticket that
 *   is not a plain token is never offered
 * - Only `role=client` URLs of the signed-in Core are carried; anything else goes to the base
 *   factory untouched
 * - No keepalive frame: the server pings every socket every 30 s, and every runtime answers
 */

import type {
  WebSocketFactory,
  WebSocketLike,
} from "@getpaseo/client/internal/daemon-client-transport-types";
import { Backoff } from "./core-backoff";

/** Core's endpoint that signs a relay socket's ticket. */
export const CORE_RELAY_TICKET_PATH = "/user/groupon_desk/paseo_relay/ticket";
/** The realtime server's relay socket (`REALTIME_RELAY_PATH`). */
export const REALTIME_RELAY_PATH = "/relay/v2";
/** The subprotocol the server echoes (`REALTIME_SUBPROTOCOL`). */
export const REALTIME_SUBPROTOCOL = "grpn-ws.v1";
/** The subprotocol that carries the ticket (`REALTIME_TICKET_SUBPROTOCOL_PREFIX`). */
export const REALTIME_TICKET_PREFIX = "ticket.";
/** The server's restart (`REALTIME_CLOSE.restarting`): Paseo's own 1012 carries another reason. */
export const REALTIME_RESTARTING = { code: 1012, reason: "Server restarting" } as const;
/** The start of the close reason the fork's client reads as a rollover (`RELAY_ROLLOVER_REASON_PREFIX`). */
export const CORE_RELAY_ROLLOVER_REASON = "Relay rolled over";
/**
 * How long a socket must stay up for its back-off to start over (the fork client's
 * `STABLE_CONNECTION_MS`, ENC-12144): a socket the relay drops right after it opens keeps waiting longer.
 */
export const CORE_RELAY_STABLE_MS = 30_000;
const NO_TICKET_REASON = "No relay ticket from Core";
const NO_SOCKET_REASON = "Relay socket could not open";
const ABNORMAL_CLOSE = 1006;
/** A ticket as core-lib signs it (`v1.<payload>.<signature>`, base64url): a subprotocol token. */
const TICKET_PATTERN = /^[A-Za-z0-9._~-]+$/;

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** What Core signs a relay ticket for: the Mac's session, the role, a daemon data socket's id. */
export interface RelayTicketRequest {
  serverId: string;
  role: "client";
  connectionId?: string;
}

/**
 * Where Core and its realtime server are, and how to get a relay ticket from Core with the
 * person's session; null while nobody is signed in.
 */
export interface CoreRelayRoute {
  coreUrl: string;
  realtimeUrl: string;
  relayTicket(request: RelayTicketRequest): Promise<string>;
}

let currentRoute: () => CoreRelayRoute | null = () => null;

/** The session module names the signed-in Core here; the socket factory reads it per socket. */
export function setCoreRelayRoute(route: () => CoreRelayRoute | null): void {
  currentRoute = route;
}

export function coreRelayRoute(): CoreRelayRoute | null {
  return currentRoute();
}

const relayBackoffs = new Map<string, Backoff>();

/** The back-off of one relay socket URL (one Mac), shared by every socket this window opens to it. */
export function coreRelayBackoff(socketUrl: string): Backoff {
  let backoff = relayBackoffs.get(socketUrl);
  if (!backoff) {
    backoff = new Backoff();
    relayBackoffs.set(socketUrl, backoff);
  }
  return backoff;
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

/** The realtime server's relay socket for one Paseo relay client, and the ticket it needs. */
export interface RealtimeRelayTarget {
  url: string;
  ticketRequest: RelayTicketRequest;
}

/**
 * The realtime server's relay socket for a Paseo relay client URL
 * (`ws(s)://<core>/ws?serverId=..&role=client&v=2`) that names this Core; null for any other URL,
 * a daemon's socket among them.
 */
export function realtimeRelayTarget(
  relayUrl: string,
  coreUrl: string,
  realtimeUrl: string,
): RealtimeRelayTarget | null {
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
  const serverId = url.searchParams.get("serverId");
  if (!serverId) return null;
  const connectionId = url.searchParams.get("connectionId");
  const target = new URL(REALTIME_RELAY_PATH, realtimeUrl);
  target.searchParams.set("serverId", serverId);
  target.searchParams.set("role", "client");
  if (connectionId) target.searchParams.set("connectionId", connectionId);
  target.searchParams.set("v", url.searchParams.get("v") ?? "2");
  return {
    url: target.toString(),
    ticketRequest: { serverId, role: "client", ...(connectionId ? { connectionId } : {}) },
  };
}

/** The relay socket's handshake: the server's subprotocol, then the ticket. */
export function realtimeRelayProtocols(ticket: string): string[] {
  return [REALTIME_SUBPROTOCOL, `${REALTIME_TICKET_PREFIX}${ticket}`];
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

/** One of Paseo's frames as the JSON text the relay carries. */
export function wrapForCore(data: string | Uint8Array | ArrayBuffer): string {
  if (typeof data === "string") return JSON.stringify({ kind: "text", data });
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return JSON.stringify({ kind: "binary", data: bytesToBase64(bytes) });
}

export type CoreRelayIncoming =
  | { kind: "text"; data: string }
  | { kind: "binary"; data: ArrayBuffer }
  | { kind: "close"; code: number; reason: string };

/** The relay's frame back to Paseo's: text, binary, the relay's close, or null for anything else. */
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

/** The slice of a WebSocket the socket opens toward the realtime server (the browser's or React Native's). */
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
 * A WebSocket to Paseo's relay transport, over the realtime server's relay: it asks Core for a
 * ticket, opens the relay socket with it, and from then on is an ordinary socket to Paseo, its
 * frames wrapped on the way up and unwrapped on the way down. The relay's close frame ends it with
 * the relay's own code, which Paseo reacts to as it does to relay.paseo.sh's; the server's restart
 * ends it as a rollover.
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
  #ended = false;
  #openedAt: number | null = null;
  #backoffWait: ReturnType<typeof setTimeout> | null = null;
  #wakeFromBackoff: (() => void) | null = null;
  /** The socket's end was counted in the back-off (once per socket). */
  #counted = false;
  /** Paseo closed this socket after the relay socket had opened: not the relay's failure. */
  #closedByClient = false;
  readonly #backoff: Backoff;

  constructor(
    target: RealtimeRelayTarget,
    route: CoreRelayRoute,
    makeUpstream: MakeCoreUpstream = globalUpstream,
    backoff: Backoff = coreRelayBackoff(target.url),
  ) {
    this.#backoff = backoff;
    void this.#open(target, route, makeUpstream);
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
    if (this.readyState === OPEN) this.#closedByClient = true;
    this.readyState = CLOSING;
    this.#stopBackoffWait();
    try {
      this.#upstream?.close(1000, reason.slice(0, 120));
    } catch {
      // Already closing; the end below is what Paseo hears.
    }
    setTimeout(() => this.#end(code, reason), 0);
  }

  async #open(
    target: RealtimeRelayTarget,
    route: CoreRelayRoute,
    makeUpstream: MakeCoreUpstream,
  ): Promise<void> {
    await this.#waitForBackoff();
    if (this.readyState !== CONNECTING) return;
    let ticket: unknown;
    try {
      ticket = await route.relayTicket(target.ticketRequest);
    } catch {
      ticket = null;
    }
    if (this.readyState !== CONNECTING) return;
    if (typeof ticket !== "string" || !TICKET_PATTERN.test(ticket)) {
      this.#fail(NO_TICKET_REASON);
      return;
    }
    let upstream: CoreUpstreamSocket;
    try {
      upstream = makeUpstream(target.url, realtimeRelayProtocols(ticket));
    } catch {
      // The runtime's own error may quote the subprotocols, the ticket among them.
      this.#fail(NO_SOCKET_REASON);
      return;
    }
    this.#upstream = upstream;
    upstream.addEventListener("open", () => {
      if (this.readyState !== CONNECTING) {
        upstream.close(1000, "Closed while connecting");
        return;
      }
      this.readyState = OPEN;
      this.#openedAt = Date.now();
      this.#emit("open", { type: "open" });
    });
    upstream.addEventListener("message", (event) => {
      const text = eventField(event, "data");
      if (typeof text !== "string" || this.readyState !== OPEN) return;
      const frame = unwrapFromCore(text);
      if (frame === null) return;
      if (frame.kind === "close") {
        this.readyState = CLOSING;
        upstream.close(1000, "Closed by the relay");
        this.#finish(frame.code, frame.reason);
        return;
      }
      this.#emit("message", { type: "message", data: frame.data });
    });
    upstream.addEventListener("error", () => this.#emit("error", { type: "error" }));
    upstream.addEventListener("close", (event) => {
      const code = eventField(event, "code");
      const reason = eventField(event, "reason");
      this.#finish(
        typeof code === "number" ? code : ABNORMAL_CLOSE,
        typeof reason === "string" ? reason : "Relay socket ended",
      );
    });
  }

  /** The relay ended the socket: the server's restart as a rollover, anything else as it came. */
  #finish(code: number, reason: string): void {
    if (this.#ended) return;
    if (code === REALTIME_RESTARTING.code && reason === REALTIME_RESTARTING.reason) {
      this.#counted = true;
      this.#backoff.succeed();
      this.#end(code, `${CORE_RELAY_ROLLOVER_REASON}: ${reason}`);
      return;
    }
    this.#countEnd();
    this.#end(code, reason);
  }

  #fail(reason: string): void {
    this.#countEnd();
    this.#emit("error", { type: "error" });
    this.#end(1011, reason);
  }

  /** Waits out the back-off of this socket URL; a close by Paseo meanwhile ends the wait. */
  async #waitForBackoff(): Promise<void> {
    const wait = this.#backoff.waitMs();
    if (wait <= 0) return;
    await new Promise<void>((resolve) => {
      this.#wakeFromBackoff = resolve;
      this.#backoffWait = setTimeout(resolve, wait);
    });
    this.#backoffWait = null;
    this.#wakeFromBackoff = null;
  }

  #stopBackoffWait(): void {
    if (this.#backoffWait !== null) clearTimeout(this.#backoffWait);
    this.#wakeFromBackoff?.();
  }

  /**
   * Counts how the socket ended, once: a socket that stayed up `CORE_RELAY_STABLE_MS` starts the
   * count over, and every end then counts as a failure, so the next socket to this Mac waits at
   * least a jittered second. A socket Paseo itself closed after it opened counts for nothing.
   */
  #countEnd(): void {
    if (this.#counted || this.#closedByClient) return;
    this.#counted = true;
    const lived = this.#openedAt === null ? 0 : Date.now() - this.#openedAt;
    if (lived >= CORE_RELAY_STABLE_MS) this.#backoff.succeed();
    this.#backoff.fail();
  }

  #end(code: number, reason: string): void {
    if (this.#ended) return;
    this.#ended = true;
    this.readyState = CLOSED;
    this.#emit("close", { type: "close", code, reason, wasClean: code === 1000 });
  }

  #emit(event: EventName, payload: unknown): void {
    for (const listener of this.#listeners[event]) listener(payload);
  }
}

/**
 * The app's socket factory with the realtime server as the relay: a relay client URL that names
 * the signed-in Core becomes a `CoreRelaySocket`; every other URL goes to `base` as before.
 */
export function withCoreRelay(
  base: WebSocketFactory,
  route: () => CoreRelayRoute | null = coreRelayRoute,
  makeUpstream: MakeCoreUpstream = globalUpstream,
): WebSocketFactory {
  return (url, options) => {
    const current = route();
    const target =
      current === null ? null : realtimeRelayTarget(url, current.coreUrl, current.realtimeUrl);
    if (current === null || target === null) return base(url, options);
    return new CoreRelaySocket(target, current, makeUpstream);
  };
}
