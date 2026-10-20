// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Your Macs screen's states.
/**
 * Tests for the Your Macs screen model.
 *
 * Covers: packages/app/src/groupon/your-macs-model.ts
 */
import { describe, expect, it } from "vitest";
import type { HubMachineView } from "./hub-sync";
import type { HubMachine } from "./hub";
import { GROUPON_YOUR_MACS } from "./strings";
import { firstConnected, seenAgo, yourMacsModel, type YourMacsInput } from "./your-macs-model";

function machine(overrides: Partial<HubMachine> = {}): HubMachine {
  return {
    machine: "mac-1",
    name: "Tomas - Mac Studio",
    model: "Mac14,13",
    alias: null,
    isPrimary: false,
    lastSeenAt: "2026-10-20T08:00:00.000Z",
    relaySessionId: null,
    relayConnectedAt: null,
    relayOfferSealed: null,
    ...overrides,
  };
}

function view(overrides: Partial<HubMachineView> & { machine?: HubMachine } = {}): HubMachineView {
  const m = overrides.machine ?? machine();
  return {
    machine: m,
    label: m.alias ?? m.name,
    state: "noOffer",
    serverId: null,
    direct: null,
    relay: null,
    error: null,
    ...overrides,
  };
}

function input(overrides: Partial<YourMacsInput> = {}): YourMacsInput {
  return {
    views: [],
    isOnline: () => false,
    syncing: false,
    lastSyncAt: "2026-10-20T08:01:00.000Z",
    error: null,
    ...overrides,
  };
}

describe("yourMacsModel", () => {
  it("loads until the hub has answered once", () => {
    expect(yourMacsModel(input({ lastSyncAt: null, syncing: true }))).toEqual({ kind: "loading" });
    expect(yourMacsModel(input({ lastSyncAt: null }))).toEqual({ kind: "loading" });
  });

  it("says the hub could not be read when the first read failed", () => {
    const model = yourMacsModel(input({ lastSyncAt: null, error: "Core answered 503" }));
    expect(model).toEqual({
      kind: "unreadable",
      message: GROUPON_YOUR_MACS.loadFailed("Core answered 503"),
    });
  });

  it("with no Mac on the hub, shows the install instructions and nothing to open", () => {
    expect(yourMacsModel(input())).toEqual({
      kind: "macs",
      rows: [],
      anyReachable: false,
      notice: "install",
    });
  });

  it("with Macs signed in but no hand running, says none is serving, never the install text", () => {
    const model = yourMacsModel(
      input({
        views: [
          view({ machine: machine({ machine: "studio" }) }),
          view({ machine: machine({ machine: "mini" }) }),
          view({ machine: machine({ machine: "air" }) }),
        ],
      }),
    );
    if (model.kind !== "macs") throw new Error("expected macs");
    expect(model.rows).toHaveLength(3);
    expect(model.notice).toBe("noneServing");
    expect(model.anyReachable).toBe(false);
  });

  it("a Mac that never offered a connection lacks a running hand: the sentence and the command", () => {
    const model = yourMacsModel(input({ views: [view()] }));
    expect(model.kind).toBe("macs");
    if (model.kind !== "macs") return;
    expect(model.notice).toBe("noneServing");
    expect(model.rows[0]).toMatchObject({
      state: "noHand",
      openServerId: null,
      message: GROUPON_YOUR_MACS.noHand,
      hint: GROUPON_YOUR_MACS.noHandCommand,
    });
  });

  it("a Mac whose offer is stale (relay session kept, not connected) still lacks a running hand", () => {
    const stale = view({
      machine: machine({ relaySessionId: "srv_a", relayOfferSealed: "sealed" }),
      state: "added",
      serverId: "srv_a",
    });
    const model = yourMacsModel(input({ views: [stale] }));
    if (model.kind !== "macs") throw new Error("expected macs");
    expect(model.rows[0].state).toBe("noHand");
    expect(model.rows[0].openServerId).toBeNull();
    expect(model.anyReachable).toBe(false);
  });

  it("a Mac on Core's relay opens, connecting until the runtime has it online", () => {
    const onRelay = view({
      machine: machine({ relaySessionId: "srv_a", relayConnectedAt: "2026-10-20T07:59:00.000Z" }),
      state: "added",
      serverId: "srv_a",
    });
    const connecting = yourMacsModel(input({ views: [onRelay] }));
    if (connecting.kind !== "macs") throw new Error("expected macs");
    expect(connecting.rows[0]).toMatchObject({
      state: "connecting",
      openServerId: "srv_a",
      message: null,
    });
    expect(connecting.notice).toBeNull();
    expect(firstConnected(connecting)).toBeNull();

    const online = yourMacsModel(input({ views: [onRelay], isOnline: (id) => id === "srv_a" }));
    if (online.kind !== "macs") throw new Error("expected macs");
    expect(online.rows[0].state).toBe("connected");
    expect(firstConnected(online)).toBe("srv_a");
  });

  it("this Mac opens directly even before its relay connection is marked", () => {
    const here = view({ state: "added", serverId: "srv_here", direct: "127.0.0.1:6767" });
    const model = yourMacsModel(input({ views: [here] }));
    if (model.kind !== "macs") throw new Error("expected macs");
    expect(model.rows[0]).toMatchObject({
      state: "connecting",
      isThisMac: true,
      openServerId: "srv_here",
    });
  });

  it("names a different vault and an error, and shows no notice for them", () => {
    const model = yourMacsModel(
      input({
        views: [
          view({ machine: machine({ machine: "a" }), state: "sealedElsewhere" }),
          view({ machine: machine({ machine: "b" }), state: "failed", error: "bad offer" }),
        ],
      }),
    );
    if (model.kind !== "macs") throw new Error("expected macs");
    expect(model.rows.map((row) => [row.id, row.state, row.message])).toEqual([
      ["a", "otherVault", GROUPON_YOUR_MACS.otherVault],
      ["b", "failed", GROUPON_YOUR_MACS.failed("bad offer")],
    ]);
    expect(model.notice).toBeNull();
  });

  it("orders connected, connecting, then the rest; the primary and the most recent first", () => {
    const air = view({ machine: machine({ machine: "air", name: "Tomas - MacBook Air" }) });
    const cy = view({
      machine: machine({ machine: "cy", name: "CY2T43V547", lastSeenAt: "2026-10-20T09:00:00Z" }),
    });
    const studio = view({
      machine: machine({ machine: "studio", isPrimary: true, relayConnectedAt: "2026-10-20Z" }),
      state: "added",
      serverId: "srv_studio",
    });
    const model = yourMacsModel(input({ views: [air, cy, studio] }));
    if (model.kind !== "macs") throw new Error("expected macs");
    expect(model.rows.map((row) => row.id)).toEqual(["studio", "cy", "air"]);
  });
});

describe("seenAgo", () => {
  const now = new Date("2026-10-20T12:00:00.000Z");
  it.each([
    ["2026-10-20T11:59:40.000Z", "just now"],
    ["2026-10-20T11:55:00.000Z", "5 min ago"],
    ["2026-10-20T09:00:00.000Z", "3 h ago"],
    ["2026-10-19T11:00:00.000Z", "1 day ago"],
    ["2026-10-17T11:00:00.000Z", "3 days ago"],
    ["2026-10-01T11:00:00.000Z", "on 2026-10-01"],
  ])("%s reads %s", (at, expected) => {
    expect(seenAgo(at, now)).toBe(expected);
  });
});

describe("yourMacsModel, one row per Mac", () => {
  it("shows two hub records naming one daemon as one Mac, the record reached directly", () => {
    const daemon = {
      state: "added" as const,
      serverId: "srv_mini",
      relay: "wss://core/relay",
    };
    const model = yourMacsModel(
      input({
        views: [
          view({
            ...daemon,
            machine: machine({
              machine: "old",
              name: "CY2T43V547",
              lastSeenAt: "2026-10-19T08:00:00.000Z",
            }),
            label: "CY2T43V547",
          }),
          view({
            ...daemon,
            direct: "127.0.0.1:6770",
            machine: machine({ machine: "mini", alias: "Tomas - Mac Mini in Office Prague" }),
            label: "Tomas - Mac Mini in Office Prague",
          }),
        ],
        isOnline: (serverId) => serverId === "srv_mini",
      }),
    );
    expect(model.kind === "macs" ? model.rows.map((row) => [row.id, row.label]) : null).toEqual([
      ["mini", "Tomas - Mac Mini in Office Prague"],
    ]);
  });
});
