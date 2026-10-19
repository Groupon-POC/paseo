// Added for Groupon Desk (fork of Paseo, Apache-2.0): Paseo's relay client socket over Core's relay stream.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CoreRelaySocket,
  coreRelayEndpoint,
  coreRelayStreamUrl,
  encoreStreamProtocols,
  unwrapFromCore,
  withCoreRelay,
  wrapForCore,
  type CoreUpstreamSocket,
} from "./core-relay";

/** Core's end of the stream as the socket sees it: what was sent up, and events pushed down. */
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
const RELAY_URL = "ws://localhost:4100/ws?serverId=srv_mac&role=client&v=2";
const route = { coreUrl: CORE, accessToken: async () => "jwt-of-ada" };

async function openSocket(): Promise<{ socket: CoreRelaySocket; upstream: FakeUpstream }> {
  let upstream: FakeUpstream | null = null;
  const socket = new CoreRelaySocket(
    "ws://localhost:4100/user/groupon_desk/paseo_relay/stream?serverId=srv_mac&role=client&v=2",
    route,
    (url, protocols) => {
      upstream = new FakeUpstream(url, protocols);
      return upstream;
    },
    20_000,
  );
  await vi.waitFor(() => expect(upstream).not.toBeNull());
  return { socket, upstream: upstream as unknown as FakeUpstream };
}

describe("Core's address as Paseo's relay", () => {
  it("names a hosted Core on 443 with TLS and a local Core on its port without", () => {
    expect(coreRelayEndpoint("https://api-core.livingsocial.com")).toEqual({
      endpoint: "api-core.livingsocial.com:443",
      useTls: true,
    });
    expect(coreRelayEndpoint(CORE)).toEqual({ endpoint: "localhost:4100", useTls: false });
    expect(coreRelayEndpoint("not a url")).toBeNull();
  });

  it("turns a relay client URL naming Core into Core's stream URL with Paseo's routing only", () => {
    expect(coreRelayStreamUrl(RELAY_URL, CORE)).toBe(
      "ws://localhost:4100/user/groupon_desk/paseo_relay/stream?serverId=srv_mac&role=client&v=2",
    );
    expect(
      coreRelayStreamUrl(
        "wss://api-core.livingsocial.com:443/ws?serverId=srv_mac&role=client&v=2",
        "https://api-core.livingsocial.com",
      ),
    ).toBe(
      "wss://api-core.livingsocial.com/user/groupon_desk/paseo_relay/stream?serverId=srv_mac&role=client&v=2",
    );
  });

  it.each([
    ["the hand's door", "ws://127.0.0.1:6871/ws?serverId=srv_mac&role=client&v=2"],
    ["Paseo's hosted relay", "wss://relay.paseo.sh:443/ws?serverId=srv_mac&role=client&v=2"],
    ["Core over the wrong scheme", "wss://localhost:4100/ws?serverId=srv_mac&role=client&v=2"],
    ["a daemon's socket", "ws://localhost:4100/ws?serverId=srv_mac&role=server&v=2"],
    ["a direct daemon address", "ws://localhost:4100/ws"],
  ])("leaves %s alone", (_label, url) => {
    expect(coreRelayStreamUrl(url, CORE)).toBeNull();
  });
});

describe("the token in Encore's stream handshake", () => {
  it("rides the encore-ws subprotocol as base64url headers, never the URL", () => {
    const [first, second] = encoreStreamProtocols("jwt-of-ada");

    expect(first).toBe("encore-ws");
    const encoded = second.slice("encore.dev.headers.".length);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))).toEqual({
      Authorization: "Bearer jwt-of-ada",
    });
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

  it("reads Core's close with its code, and ignores what is not a frame", () => {
    expect(unwrapFromCore('{"kind":"close","code":4403,"reason":"No relay session"}')).toEqual({
      kind: "close",
      code: 4403,
      reason: "No relay session",
    });
    expect(unwrapFromCore("not json")).toBeNull();
    expect(unwrapFromCore('{"kind":"keepalive"}')).toBeNull();
  });
});

describe("CoreRelaySocket", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens Core's stream with the token, then carries frames both ways", async () => {
    const { socket, upstream } = await openSocket();
    const opened = vi.fn();
    const received: unknown[] = [];
    socket.addEventListener("open", opened);
    socket.addEventListener("message", (event) => received.push((event as { data: unknown }).data));

    upstream.fire("open");
    socket.send('{"type":"e2ee_hello"}');
    upstream.fire("message", { data: '{"kind":"text","data":"box"}' });
    upstream.fire("message", { data: '{"kind":"binary","data":"AAE="}' });

    expect(upstream.url).toContain("/user/groupon_desk/paseo_relay/stream?serverId=srv_mac");
    expect(upstream.url).not.toContain("jwt");
    expect(upstream.protocols).toEqual(encoreStreamProtocols("jwt-of-ada"));
    expect(opened).toHaveBeenCalledTimes(1);
    expect(socket.readyState).toBe(1);
    expect(upstream.sent).toEqual(['{"kind":"text","data":"{\\"type\\":\\"e2ee_hello\\"}"}']);
    expect(received[0]).toBe("box");
    expect(new Uint8Array(received[1] as ArrayBuffer)).toEqual(new Uint8Array([0, 1]));
  });

  it("ends with Core's own close code, once, and closes the stream", async () => {
    const { socket, upstream } = await openSocket();
    const closes: unknown[] = [];
    socket.addEventListener("close", (event) => closes.push(event));
    upstream.fire("open");

    upstream.fire("message", {
      data: '{"kind":"close","code":4403,"reason":"No relay session of yours has this id"}',
    });
    upstream.fire("close", { code: 1000, reason: "" });

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

  it("tells Paseo the stream failed when Core refuses the handshake", async () => {
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

  it("keeps Core's stream alive while it is open", async () => {
    vi.useFakeTimers();
    const { upstream } = await openSocket();
    upstream.fire("open");

    vi.advanceTimersByTime(60_000);

    expect(upstream.sent).toEqual(Array(3).fill('{"kind":"keepalive"}'));
  });

  it("closes without opening Core's stream when Paseo closes it first", async () => {
    const make = vi.fn();
    let release: (token: string) => void = () => {};
    const socket = new CoreRelaySocket(
      "ws://localhost:4100/user/groupon_desk/paseo_relay/stream",
      { coreUrl: CORE, accessToken: () => new Promise((resolve) => (release = resolve)) },
      make,
    );
    const closed = new Promise((resolve) => socket.addEventListener("close", resolve));

    socket.close(1000, "probe done");
    release("jwt-of-ada");

    expect(await closed).toMatchObject({ code: 1000, reason: "probe done" });
    expect(make).not.toHaveBeenCalled();
  });

  it("fails as a closed socket when nobody is signed in", async () => {
    const socket = new CoreRelaySocket("ws://localhost:4100/x", {
      coreUrl: CORE,
      accessToken: async () => {
        throw new Error("Not signed in to Groupon.");
      },
    });
    const closed = new Promise((resolve) => socket.addEventListener("close", resolve));

    expect(await closed).toMatchObject({ code: 1011, reason: "Not signed in to Groupon" });
  });
});

describe("withCoreRelay", () => {
  it("gives a relay URL naming the signed-in Core a Core socket, and everything else the base", async () => {
    const base = vi.fn(() => ({ readyState: 0, send: vi.fn(), close: vi.fn() }));
    const make = vi.fn(
      (url: string, protocols: string[]): CoreUpstreamSocket => new FakeUpstream(url, protocols),
    );
    const factory = withCoreRelay(base, () => route, make);

    const viaCore = factory(RELAY_URL);
    factory("ws://127.0.0.1:6870/ws", { protocols: ["x"] });
    const signedOut = withCoreRelay(base, () => null, make);
    signedOut(RELAY_URL);

    expect(viaCore).toBeInstanceOf(CoreRelaySocket);
    expect(base).toHaveBeenCalledTimes(2);
    expect(base).toHaveBeenNthCalledWith(1, "ws://127.0.0.1:6870/ws", { protocols: ["x"] });
    await vi.waitFor(() => expect(make).toHaveBeenCalledTimes(1));
  });
});
