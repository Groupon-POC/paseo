// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's relay client socket over the realtime server's relay.
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebSocket as WsClient, WebSocketServer } from "ws";
import { Backoff } from "./core-backoff";
import {
  CORE_RELAY_ROLLOVER_REASON,
  CORE_RELAY_STABLE_MS,
  CoreRelaySocket,
  coreRelayEndpoint,
  realtimeRelayProtocols,
  realtimeRelayTarget,
  unwrapFromCore,
  withCoreRelay,
  wrapForCore,
  type CoreRelayRoute,
  type CoreUpstreamSocket,
  type MakeCoreUpstream,
  type RealtimeRelayTarget,
  type RelayTicketRequest,
} from "./core-relay";

/** The realtime server's end of a socket as the socket sees it: what was sent up, and events pushed down. */
class FakeUpstream implements CoreUpstreamSocket {
  readyState = 0;
  readonly sent: string[] = [];
  closedWith: number | null = null;
  readonly #listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closedWith = code ?? 1000;
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  fire(type: string, event: unknown = {}): void {
    if (type === "open") this.readyState = 1;
    if (type === "close") this.readyState = 3;
    for (const listener of this.#listeners.get(type) ?? []) listener(event);
  }
}

const CORE = "http://localhost:4100";
const REALTIME = "ws://localhost:4102";
const RELAY_URL = "ws://localhost:4100/ws?serverId=srv_mac&role=client&v=2";
const TARGET: RealtimeRelayTarget = {
  url: "ws://localhost:4102/relay/v2?serverId=srv_mac&role=client&v=2",
  ticketRequest: { serverId: "srv_mac", role: "client" },
};

function routeWith(tickets: string[]): CoreRelayRoute & { asked: RelayTicketRequest[] } {
  const asked: RelayTicketRequest[] = [];
  return {
    coreUrl: CORE,
    realtimeUrl: REALTIME,
    asked,
    relayTicket: async (request) => {
      asked.push(request);
      const ticket = tickets.shift();
      if (ticket === undefined) throw new Error("no ticket left");
      return ticket;
    },
  };
}

async function openSocket(
  backoff: Backoff = new Backoff(),
): Promise<{ socket: CoreRelaySocket; upstream: FakeUpstream }> {
  let upstream: FakeUpstream | null = null;
  const socket = new CoreRelaySocket(
    TARGET,
    routeWith(["v1.ticket-of-ada.sig"]),
    (url, protocols) => {
      upstream = new FakeUpstream(url, protocols);
      return upstream;
    },
    backoff,
  );
  await vi.waitFor(() => expect(upstream).not.toBeNull());
  return { socket, upstream: upstream as unknown as FakeUpstream };
}

describe("the realtime server's relay for a relay client URL", () => {
  it("names a hosted Core on 443 with TLS and a local Core on its port without", () => {
    expect(coreRelayEndpoint("https://api-core.livingsocial.com")).toEqual({
      endpoint: "api-core.livingsocial.com:443",
      useTls: true,
    });
    expect(coreRelayEndpoint(CORE)).toEqual({ endpoint: "localhost:4100", useTls: false });
    expect(coreRelayEndpoint("not a url")).toBeNull();
  });

  it("turns a relay client URL naming Core into the realtime server's relay socket and its ticket request", () => {
    expect(realtimeRelayTarget(RELAY_URL, CORE, REALTIME)).toEqual(TARGET);
    expect(
      realtimeRelayTarget(
        "wss://api-core.livingsocial.com:443/ws?serverId=srv_mac&role=client&connectionId=conn_1&v=2",
        "https://api-core.livingsocial.com",
        "wss://ws.livingsocial.com",
      ),
    ).toEqual({
      url: "wss://ws.livingsocial.com/relay/v2?serverId=srv_mac&role=client&connectionId=conn_1&v=2",
      ticketRequest: { serverId: "srv_mac", role: "client", connectionId: "conn_1" },
    });
  });

  it.each([
    ["the hand's door", "ws://127.0.0.1:6871/ws?serverId=srv_mac&role=client&v=2"],
    ["Paseo's hosted relay", "wss://relay.paseo.sh:443/ws?serverId=srv_mac&role=client&v=2"],
    ["Core over the wrong scheme", "wss://localhost:4100/ws?serverId=srv_mac&role=client&v=2"],
    ["a daemon's socket", "ws://localhost:4100/ws?serverId=srv_mac&role=server&v=2"],
    ["a client URL without a session", "ws://localhost:4100/ws?role=client&v=2"],
    ["a direct daemon address", "ws://localhost:4100/ws"],
  ])("leaves %s alone", (_label, url) => {
    expect(realtimeRelayTarget(url, CORE, REALTIME)).toBeNull();
  });

  it("offers the ticket as the second subprotocol, never in the URL", () => {
    expect(realtimeRelayProtocols("v1.abc.def")).toEqual(["grpn-ws.v1", "ticket.v1.abc.def"]);
  });
});

describe("frames each way", () => {
  it("wraps text as it is and binary as base64, and unwraps them byte for byte", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);

    const text = unwrapFromCore(wrapForCore('{"type":"e2ee_hello"}'));
    const binary = unwrapFromCore(wrapForCore(bytes));

    expect(text).toEqual({ kind: "text", data: '{"type":"e2ee_hello"}' });
    if (binary?.kind !== "binary") throw new Error("not a binary frame");
    expect(new Uint8Array(binary.data)).toEqual(bytes);
    expect(JSON.parse(wrapForCore(bytes.buffer))).toEqual({ kind: "binary", data: "AAEC+v8=" });
  });

  it("reads the relay's close with its code, and ignores what is not a frame", () => {
    expect(unwrapFromCore('{"kind":"close","code":4403,"reason":"No relay session"}')).toEqual({
      kind: "close",
      code: 4403,
      reason: "No relay session",
    });
    expect(unwrapFromCore("not json")).toBeNull();
    expect(unwrapFromCore('{"kind":"keepalive"}')).toBeNull();
  });
});

/**
 * The realtime server as the relay socket meets it (`apps/backend-realtime-ts` in the monorepo):
 * it echoes `grpn-ws.v1`, takes each ticket once, refuses one it does not hold with a close frame
 * and 4401 after the upgrade, and ends every socket with a close frame and 1012 when it restarts.
 */
class FakeRealtimeServer {
  readonly offered: string[] = [];
  readonly urls: string[] = [];
  readonly #valid = new Set<string>();
  readonly #server: WebSocketServer;
  readonly #sockets = new Set<WsClient>();

  constructor() {
    this.#server = new WebSocketServer({
      port: 0,
      handleProtocols: (protocols) => (protocols.has("grpn-ws.v1") ? "grpn-ws.v1" : false),
    });
    this.#server.on("connection", (ws, request) => {
      this.urls.push(request.url ?? "");
      const protocols = String(request.headers["sec-websocket-protocol"] ?? "")
        .split(",")
        .map((value) => value.trim());
      const ticket = protocols.find((value) => value.startsWith("ticket."))?.slice(7) ?? "";
      this.offered.push(ticket);
      if (!this.#valid.delete(ticket)) {
        this.#end(ws, 4401, "Ticket refused");
        return;
      }
      this.#sockets.add(ws);
      ws.on("close", () => this.#sockets.delete(ws));
      ws.on("message", (data) => {
        const frame = JSON.parse(String(data)) as { kind: string; data: string };
        ws.send(JSON.stringify({ kind: frame.kind, data: `echo:${frame.data}` }));
      });
    });
  }

  get url(): string {
    return `ws://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
  }

  issue(ticket: string): string {
    this.#valid.add(ticket);
    return ticket;
  }

  restart(): void {
    for (const ws of this.#sockets) this.#end(ws, 1012, "Server restarting");
  }

  #end(ws: WsClient, code: number, reason: string): void {
    ws.send(JSON.stringify({ kind: "close", code, reason }));
    ws.close(code, reason);
  }

  async stop(): Promise<void> {
    for (const ws of this.#server.clients) ws.terminate();
    await new Promise((resolve) => this.#server.close(resolve));
  }
}

const wsUpstream: MakeCoreUpstream = (url, protocols) =>
  new WsClient(url, protocols) as unknown as CoreUpstreamSocket;

interface Watched {
  socket: CoreRelaySocket;
  opened: Promise<void>;
  closed: Promise<{ code: number; reason: string }>;
  received: unknown[];
}

function watch(socket: CoreRelaySocket): Watched {
  const received: unknown[] = [];
  socket.addEventListener("message", (event) => received.push((event as { data: unknown }).data));
  return {
    socket,
    received,
    opened: new Promise((resolve) => socket.addEventListener("open", () => resolve())),
    closed: new Promise((resolve) =>
      socket.addEventListener("close", (event) =>
        resolve(event as { code: number; reason: string }),
      ),
    ),
  };
}

describe("CoreRelaySocket against the realtime server", () => {
  let server: FakeRealtimeServer;
  beforeEach(() => {
    vi.useRealTimers();
    server = new FakeRealtimeServer();
  });
  afterEach(async () => {
    await server.stop();
  });

  function targetOn(serverUrl: string): RealtimeRelayTarget {
    const target = realtimeRelayTarget(RELAY_URL, CORE, serverUrl);
    if (target === null) throw new Error("no target");
    return target;
  }

  it("asks Core for a ticket for this Mac, offers it on the subprotocol only, and carries frames both ways", async () => {
    const route = routeWith([server.issue("v1.ticket-one.sig")]);
    const relay = watch(
      new CoreRelaySocket(targetOn(server.url), route, wsUpstream, new Backoff()),
    );

    await relay.opened;
    relay.socket.send('{"type":"e2ee_hello"}');
    await vi.waitFor(() => expect(relay.received).toHaveLength(1));

    expect(route.asked).toEqual([{ serverId: "srv_mac", role: "client" }]);
    expect(server.offered).toEqual(["v1.ticket-one.sig"]);
    expect(server.urls).toEqual(["/relay/v2?serverId=srv_mac&role=client&v=2"]);
    expect(relay.received).toEqual(['echo:{"type":"e2ee_hello"}']);
    relay.socket.close(1000, "done");
    expect(await relay.closed).toMatchObject({ code: 1000, reason: "done" });
  });

  it("ends a socket the server restarts as a rollover, and the next socket opens at once with a new ticket", async () => {
    const backoff = new Backoff({ random: () => 0.5 });
    const route = routeWith([server.issue("v1.first.sig"), server.issue("v1.second.sig")]);
    const first = watch(new CoreRelaySocket(targetOn(server.url), route, wsUpstream, backoff));
    await first.opened;

    server.restart();
    const closed = await first.closed;

    expect(closed.code).toBe(1012);
    expect(closed.reason.startsWith(CORE_RELAY_ROLLOVER_REASON)).toBe(true);
    expect(backoff.waitMs()).toBe(0);
    const second = watch(new CoreRelaySocket(targetOn(server.url), route, wsUpstream, backoff));
    await second.opened;
    expect(server.offered).toEqual(["v1.first.sig", "v1.second.sig"]);
  });

  it("ends with 4401 when the server refuses the ticket, and the next socket fetches a new ticket first", async () => {
    const backoff = new Backoff({ random: () => 0.5 });
    const route = routeWith(["v1.stale.sig", server.issue("v1.fresh.sig")]);
    const refused = watch(new CoreRelaySocket(targetOn(server.url), route, wsUpstream, backoff));

    expect(await refused.closed).toMatchObject({ code: 4401, reason: "Ticket refused" });
    expect(backoff.attempt).toBe(1);

    backoff.succeed();
    const next = watch(new CoreRelaySocket(targetOn(server.url), route, wsUpstream, backoff));
    await next.opened;
    expect(route.asked).toHaveLength(2);
    expect(server.offered).toEqual(["v1.stale.sig", "v1.fresh.sig"]);
  });

  it("keeps the ticket out of every close reason when Core's answer is no ticket", async () => {
    const make = vi.fn(wsUpstream);
    const route = routeWith(["v1.bad ticket\r\nx"]);
    const relay = watch(new CoreRelaySocket(targetOn(server.url), route, make, new Backoff()));

    const closed = await relay.closed;

    expect(closed).toMatchObject({ code: 1011, reason: "No relay ticket from Core" });
    expect(make).not.toHaveBeenCalled();
    expect(server.offered).toEqual([]);
  });
});

describe("CoreRelaySocket", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the relay socket with the ticket, then carries text and binary frames", async () => {
    const { socket, upstream } = await openSocket();
    const opened = vi.fn();
    const received: unknown[] = [];
    socket.addEventListener("open", opened);
    socket.addEventListener("message", (event) => received.push((event as { data: unknown }).data));

    upstream.fire("open");
    socket.send('{"type":"e2ee_hello"}');
    upstream.fire("message", { data: '{"kind":"text","data":"box"}' });
    upstream.fire("message", { data: '{"kind":"binary","data":"AAE="}' });

    expect(upstream.url).toBe(TARGET.url);
    expect(upstream.protocols).toEqual(["grpn-ws.v1", "ticket.v1.ticket-of-ada.sig"]);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(1);
    expect(upstream.sent).toEqual(['{"kind":"text","data":"{\\"type\\":\\"e2ee_hello\\"}"}']);
    expect(received[0]).toBe("box");
    expect(new Uint8Array(received[1] as ArrayBuffer)).toEqual(new Uint8Array([0, 1]));
  });

  it("ends with the relay's own close code, once, and closes the socket", async () => {
    const { socket, upstream } = await openSocket();
    const closes: unknown[] = [];
    socket.addEventListener("close", (event) => closes.push(event));
    upstream.fire("open");

    upstream.fire("message", {
      data: '{"kind":"close","code":4403,"reason":"No relay session of yours has this id"}',
    });
    upstream.fire("close", { code: 4403, reason: "" });

    expect(closes).toEqual([
      {
        type: "close",
        code: 4403,
        reason: "No relay session of yours has this id",
        wasClean: false,
      },
    ]);
    expect(socket.readyState).toBe(3);
    expect(upstream.closedWith).toBe(1000);
    expect(() => socket.send("late")).toThrow("WebSocket not open");
  });

  it("keeps Paseo's own 1012 (the daemon went) a failure, not a rollover", async () => {
    const backoff = new Backoff({ random: () => 0.5 });
    const { socket, upstream } = await openSocket(backoff);
    const closes: unknown[] = [];
    socket.addEventListener("close", (event) => closes.push(event));
    upstream.fire("open");

    upstream.fire("message", {
      data: '{"kind":"close","code":1012,"reason":"Server disconnected"}',
    });

    expect(closes).toEqual([
      { type: "close", code: 1012, reason: "Server disconnected", wasClean: false },
    ]);
    expect(backoff.attempt).toBe(1);
  });

  it("tells Paseo the socket failed when the server refuses the handshake", async () => {
    const { socket, upstream } = await openSocket();
    const events: string[] = [];
    socket.addEventListener("error", () => events.push("error"));
    socket.addEventListener("close", (event) =>
      events.push(`close ${(event as { code: number }).code}`),
    );

    upstream.fire("error");
    upstream.fire("close", { code: 1006 });

    expect(events).toEqual(["error", "close 1006"]);
  });

  it("closes without asking for a ticket's socket when Paseo closes it first", async () => {
    const make = vi.fn();
    let release: (ticket: string) => void = () => {};
    const socket = new CoreRelaySocket(
      TARGET,
      {
        coreUrl: CORE,
        realtimeUrl: REALTIME,
        relayTicket: () => new Promise((resolve) => (release = resolve)),
      },
      make,
      new Backoff(),
    );
    const closed = new Promise((resolve) => socket.addEventListener("close", resolve));

    socket.close(1000, "probe done");
    release("v1.ticket.sig");

    expect(await closed).toMatchObject({ code: 1000, reason: "probe done" });
    expect(make).not.toHaveBeenCalled();
  });

  it("fails as a closed socket when Core gives no ticket, its error unrepeated", async () => {
    const socket = new CoreRelaySocket(
      TARGET,
      {
        coreUrl: CORE,
        realtimeUrl: REALTIME,
        relayTicket: async () => {
          throw new Error("Not signed in to Groupon.");
        },
      },
      undefined,
      new Backoff(),
    );
    const closed = new Promise((resolve) => socket.addEventListener("close", resolve));

    expect(await closed).toMatchObject({ code: 1011, reason: "No relay ticket from Core" });
  });

  it("ends as a failure when the socket cannot be made, the ticket kept out of the reason", async () => {
    const socket = new CoreRelaySocket(
      TARGET,
      routeWith(["v1.ticket-of-ada.sig"]),
      (_url, protocols) => {
        throw new SyntaxError(`bad protocol ${protocols.join(",")}`);
      },
      new Backoff(),
    );
    const closed = new Promise<{ reason: string }>((resolve) =>
      socket.addEventListener("close", (event) => resolve(event as { reason: string })),
    );

    const { reason } = await closed;
    expect(reason).toBe("Relay socket could not open");
    expect(reason).not.toContain("ticket-of-ada");
  });
});

describe("CoreRelaySocket under an overloaded relay", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * Paseo's client as the window runs it, made worse: it opens a new socket 100 ms after each
   * close, and every socket is refused at the handshake (an error and a 1006).
   */
  function reconnectingClient(backoff: Backoff, refuse: (upstream: FakeUpstream) => void) {
    const upstreams: FakeUpstream[] = [];
    let stopped = false;
    const connect = () => {
      if (stopped) return;
      const socket = new CoreRelaySocket(
        TARGET,
        { coreUrl: CORE, realtimeUrl: REALTIME, relayTicket: async () => "v1.t.s" },
        (url, protocols) => {
          const upstream = new FakeUpstream(url, protocols);
          upstreams.push(upstream);
          setTimeout(() => refuse(upstream), 50);
          return upstream;
        },
        backoff,
      );
      socket.addEventListener("close", () => setTimeout(connect, 100));
    };
    connect();
    return {
      upstreams,
      stop: () => {
        stopped = true;
      },
    };
  }

  it("opens the relay a few times a minute while every socket is refused", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const client = reconnectingClient(new Backoff(), (upstream) => {
      upstream.fire("error");
      upstream.fire("close", { code: 1006 });
    });

    await vi.advanceTimersByTimeAsync(60_000);
    const firstMinute = client.upstreams.length;
    await vi.advanceTimersByTimeAsync(120_000);
    const nextTwoMinutes = client.upstreams.length - firstMinute;
    client.stop();
    vi.restoreAllMocks();

    // Without the back-off this client would open about 400 sockets a minute.
    expect(firstMinute).toBe(7);
    expect(nextTwoMinutes).toBe(4);
  });

  it("counts a socket the relay drops right after it opened, and starts over after one that stayed up", async () => {
    const backoff = new Backoff({ random: () => 0.5 });
    for (let i = 0; i < 3; i += 1) {
      vi.advanceTimersByTime(backoff.waitMs());
      const { upstream } = await openSocket(backoff);
      upstream.fire("open");
      upstream.fire("message", {
        data: '{"kind":"close","code":1012,"reason":"Server disconnected"}',
      });
    }
    expect(backoff.attempt).toBe(3);

    vi.advanceTimersByTime(backoff.waitMs());
    const { upstream } = await openSocket(backoff);
    upstream.fire("open");
    vi.advanceTimersByTime(CORE_RELAY_STABLE_MS);
    upstream.fire("close", { code: 1011 });
    expect(backoff.attempt).toBe(1);
  });

  it("does not count a close Paseo asked for on an open socket, and waits out the back-off before opening", async () => {
    const backoff = new Backoff({ random: () => 0.5 });
    const { socket, upstream } = await openSocket(backoff);
    upstream.fire("open");
    socket.close(1000, "done");
    upstream.fire("close", { code: 1000 });
    expect(backoff.attempt).toBe(0);

    backoff.fail();
    backoff.fail();
    const make = vi.fn((url: string, protocols: string[]) => new FakeUpstream(url, protocols));
    const waiting = new CoreRelaySocket(TARGET, routeWith(["v1.t.s"]), make, backoff);
    await vi.advanceTimersByTimeAsync(999);
    expect(make).not.toHaveBeenCalled();
    expect(waiting.readyState).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(make).toHaveBeenCalledTimes(1);
  });
});

describe("withCoreRelay", () => {
  it("gives a relay URL naming the signed-in Core a realtime relay socket, and everything else the base", async () => {
    const base = vi.fn(() => ({ readyState: 0, send: vi.fn(), close: vi.fn() }));
    const make = vi.fn(
      (url: string, protocols: string[]): CoreUpstreamSocket => new FakeUpstream(url, protocols),
    );
    const route = routeWith(["v1.t.s"]);
    const factory = withCoreRelay(base, () => route, make);

    const viaRealtime = factory(RELAY_URL);
    factory("ws://127.0.0.1:6870/ws", { protocols: ["x"] });
    const signedOut = withCoreRelay(base, () => null, make);
    signedOut(RELAY_URL);

    expect(viaRealtime).toBeInstanceOf(CoreRelaySocket);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base).toHaveBeenNthCalledWith(1, "ws://127.0.0.1:6870/ws", { protocols: ["x"] });
    await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(1));
    expect(make).toHaveBeenCalledWith(TARGET.url, ["grpn-ws.v1", "ticket.v1.t.s"]);
  });
});
