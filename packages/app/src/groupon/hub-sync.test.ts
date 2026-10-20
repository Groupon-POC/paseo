// Added for Groupon Desk (fork of Paseo, Apache-2.0): a Mac on the hub becomes a host only when its offer opens, through the door or through Core; the list is read again on a schedule.
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upsertTrustedOffer = vi.fn(
  async (_url: string, _label?: string, relay?: { endpoint: string; useTls: boolean }) => ({
    serverId: "srv_test",
    connections: [
      {
        id: `relay:${relay?.endpoint ?? "127.0.0.1:6871"}`,
        type: "relay",
        relayEndpoint: relay?.endpoint ?? "127.0.0.1:6871",
      },
    ],
  }),
);
const upsertConnectionFromListen = vi.fn(
  async (_input: { listenAddress: string; serverId: string; hostname: string | null }) => ({
    serverId: "srv_test",
  }),
);
vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ upsertTrustedOffer, upsertConnectionFromListen }),
  isHostRuntimeConnected: () => false,
  useHostRegistryStatus: () => "ready",
}));
vi.mock("@/hooks/use-app-visible", () => ({
  useAppVisible: () => true,
  useAppActivelyVisible: () => true,
}));
const session: { sealKey: Uint8Array | null; coreUrl: string } = {
  sealKey: null,
  coreUrl: "https://api-core.livingsocial.com",
};
vi.mock("./session", () => ({
  useGrouponStore: { getState: () => session },
  grouponRequest: vi.fn(),
}));
const fetchMachines = vi.fn();
vi.mock("./hub", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./hub")>()),
  fetchMachines: () => fetchMachines(),
}));
vi.mock("./local-daemon", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./local-daemon")>()),
  readLocalDaemons: async () => [],
}));

const {
  addMachine,
  createHubResync,
  HUB_EVENT_RESYNC_GAP_MS,
  HUB_RESYNC_MS,
  relayForDevice,
  useHubMachinesStore,
} = await import("./hub-sync");
const { sealKeyFromVaultKey } = await import("./crypto");

const LABEL = "groupon-desk-relay/1";
const vaultKey = Buffer.alloc(32, 3);

/** The hand's seal (monorepo `hand/seal.ts`), here to make a fixture. */
function sealAsTheHand(plain: string, scope: string, kind: string, key: Buffer): string {
  const relay = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), Buffer.from(LABEL), 32));
  const seal = Buffer.from(
    hkdfSync("sha256", relay, Buffer.alloc(0), Buffer.from(`${LABEL}/seal`), 32),
  );
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", seal, nonce);
  cipher.setAAD(Buffer.from(`${LABEL}:${scope}:${kind}`));
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]).toString("base64");
}

const OFFER = `https://app.paseo.sh/#offer=${Buffer.from(
  JSON.stringify({
    v: 2,
    serverId: "srv_test",
    daemonPublicKeyB64: "a2V5",
    relay: { endpoint: "127.0.0.1:6871", useTls: false },
  }),
).toString("base64url")}`;

function machine(overrides: Record<string, unknown> = {}) {
  return {
    machine: "mac-1",
    name: "Tomas's MacBook",
    model: null,
    alias: "Studio",
    isPrimary: true,
    lastSeenAt: "2026-10-19T10:00:00.000Z",
    relaySessionId: "srv_test",
    relayConnectedAt: "2026-10-19T10:00:00.000Z",
    relayOfferSealed: sealAsTheHand(OFFER, "mac-1", "paseo_offer", vaultKey),
    ...overrides,
  };
}

describe("relayForDevice", () => {
  it("keeps the hand's door on a Mac that runs a hand, and goes to Core everywhere else", () => {
    const local = [{ serverId: "srv_test", listen: "127.0.0.1:6870" }];

    expect(relayForDevice(local, "http://localhost:4100")).toBeNull();
    expect(relayForDevice([], "http://localhost:4100")).toEqual({
      endpoint: "localhost:4100",
      useTls: false,
    });
    expect(relayForDevice([], "https://api-core.livingsocial.com")).toEqual({
      endpoint: "api-core.livingsocial.com:443",
      useTls: true,
    });
  });
});

describe("addMachine", () => {
  const sealKey = sealKeyFromVaultKey(new Uint8Array(vaultKey));
  beforeEach(() => {
    upsertTrustedOffer.mockClear();
    upsertConnectionFromListen.mockClear();
  });

  it("opens the offer with the seal key and adds the Mac under its alias", async () => {
    const view = await addMachine(machine(), sealKey);
    expect(view).toMatchObject({ state: "added", serverId: "srv_test", label: "Studio" });
    expect(upsertTrustedOffer).toHaveBeenCalledWith(OFFER, "Studio");
    expect(upsertConnectionFromListen).not.toHaveBeenCalled();
    expect(view.direct).toBeNull();
    expect(view.relay).toBe("127.0.0.1:6871");
  });

  it("adds the Mac through Core when the device has no door, with the offer's own daemon key", async () => {
    const viaCore = { endpoint: "api-core.livingsocial.com:443", useTls: true };

    const view = await addMachine(machine(), sealKey, [], viaCore);

    expect(upsertTrustedOffer).toHaveBeenCalledWith(OFFER, "Studio", viaCore);
    expect(view).toMatchObject({
      state: "added",
      relay: "api-core.livingsocial.com:443",
      direct: null,
    });
  });

  it("gives the Mac the app runs on a direct connection beside the relay", async () => {
    const local = [
      { serverId: "srv_other", listen: "127.0.0.1:6990" },
      { serverId: "srv_test", listen: "127.0.0.1:6870" },
    ];
    const view = await addMachine(machine(), sealKey, local);
    expect(view).toMatchObject({ state: "added", direct: "127.0.0.1:6870" });
    expect(upsertConnectionFromListen).toHaveBeenCalledWith({
      listenAddress: "127.0.0.1:6870",
      serverId: "srv_test",
      hostname: "Studio",
    });
  });

  it("adds nothing for a Mac without an offer, or one sealed for another Mac or vault", async () => {
    expect((await addMachine(machine({ relayOfferSealed: null }), sealKey)).state).toBe("noOffer");
    const otherMac = machine({
      relayOfferSealed: sealAsTheHand(OFFER, "mac-2", "paseo_offer", vaultKey),
    });
    expect((await addMachine(otherMac, sealKey)).state).toBe("sealedElsewhere");
    const otherVault = machine({
      relayOfferSealed: sealAsTheHand(OFFER, "mac-1", "paseo_offer", Buffer.alloc(32, 9)),
    });
    expect((await addMachine(otherVault, sealKey)).state).toBe("sealedElsewhere");
    expect(upsertTrustedOffer).not.toHaveBeenCalled();
  });

  it("says why when the host runtime refuses the offer", async () => {
    upsertTrustedOffer.mockRejectedValueOnce(new Error("bad offer"));
    const view = await addMachine(machine({ alias: null }), sealKey);
    expect(view).toMatchObject({
      state: "failed",
      serverId: "srv_test",
      label: "Tomas's MacBook",
      error: "bad offer",
    });
  });
});

/** A sync that stays in flight until the test settles it. */
function pendingSync() {
  const settles: Array<() => void> = [];
  const sync = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        settles.push(resolve);
      }),
  );
  const settle = async () => {
    for (const resolve of settles.splice(0)) resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { sync, settle };
}

describe("createHubResync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the hub every 30 s while the window is in the foreground", async () => {
    const sync = vi.fn(async () => undefined);
    const resync = createHubResync({ sync });

    resync.setForeground(true);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS);
    expect(sync).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS);
    expect(sync).toHaveBeenCalledTimes(3);
    resync.stop();
  });

  it("does not read while the window is hidden, and reads at once when it is back", async () => {
    const sync = vi.fn(async () => undefined);
    const resync = createHubResync({ sync });
    resync.setForeground(true);
    resync.setForeground(false);
    sync.mockClear();

    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS * 4);
    resync.nudge();
    expect(sync).not.toHaveBeenCalled();

    resync.setForeground(true);
    expect(sync).toHaveBeenCalledTimes(1);
    resync.stop();
  });

  it("reads again when the window regains focus, but not twice within the gap", async () => {
    const sync = vi.fn(async () => undefined);
    const resync = createHubResync({ sync });
    resync.setForeground(true);
    sync.mockClear();

    resync.nudge();
    expect(sync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(HUB_EVENT_RESYNC_GAP_MS);
    resync.nudge();
    expect(sync).toHaveBeenCalledTimes(1);
    resync.nudge();
    expect(sync).toHaveBeenCalledTimes(1);
    resync.stop();
  });

  it("never starts a read while one is in flight", async () => {
    const { sync, settle } = pendingSync();
    const resync = createHubResync({ sync });

    resync.syncNow();
    resync.setForeground(true);
    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS * 3);
    resync.nudge();
    resync.syncNow();
    expect(sync).toHaveBeenCalledTimes(1);

    await settle();
    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS);
    expect(sync).toHaveBeenCalledTimes(2);
    resync.stop();
  });

  it("keeps the schedule going after a read fails", async () => {
    const sync = vi.fn(async () => {
      throw new Error("hub down");
    });
    const resync = createHubResync({ sync });
    resync.setForeground(true);
    await vi.advanceTimersByTimeAsync(HUB_RESYNC_MS);
    expect(sync).toHaveBeenCalledTimes(2);
    resync.stop();
  });
});

describe("useHubMachinesStore.sync", () => {
  beforeEach(() => {
    session.sealKey = sealKeyFromVaultKey(new Uint8Array(vaultKey));
    fetchMachines.mockReset();
    useHubMachinesStore.setState({ machines: [], syncing: false, lastSyncAt: null, error: null });
  });
  afterEach(() => {
    session.sealKey = null;
  });

  it("asks the hub once while a read is in flight", async () => {
    let answer: (value: { machines: unknown[] }) => void = () => undefined;
    fetchMachines.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const { sync } = useHubMachinesStore.getState();

    const first = sync();
    const second = sync();
    answer({ machines: [machine()] });
    await Promise.all([first, second]);

    expect(fetchMachines).toHaveBeenCalledTimes(1);
    expect(useHubMachinesStore.getState().machines).toHaveLength(1);
  });

  it("keeps the last list and the error line through a failing read until one succeeds", async () => {
    fetchMachines.mockResolvedValueOnce({ machines: [machine()] });
    const { sync } = useHubMachinesStore.getState();
    await sync();
    const listed = useHubMachinesStore.getState();

    fetchMachines.mockRejectedValueOnce(new Error("hub down"));
    await sync();
    expect(useHubMachinesStore.getState()).toMatchObject({
      machines: listed.machines,
      lastSyncAt: listed.lastSyncAt,
      error: "hub down",
    });

    let answer: (value: { machines: unknown[] }) => void = () => undefined;
    fetchMachines.mockReturnValueOnce(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const retry = sync();
    expect(useHubMachinesStore.getState()).toMatchObject({ syncing: true, error: "hub down" });
    answer({ machines: [machine()] });
    await retry;
    expect(useHubMachinesStore.getState().error).toBeNull();
  });
});
