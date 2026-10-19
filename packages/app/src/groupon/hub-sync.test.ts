// Added for Groupon Desk (fork of Paseo, Apache-2.0): a Mac on the hub becomes a host only when its offer opens, through the door or through Core.
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  useHostRegistryStatus: () => "ready",
}));
vi.mock("./session", () => ({
  useGrouponStore: { getState: () => ({ sealKey: null }) },
  grouponRequest: vi.fn(),
}));

const { addMachine, relayForDevice } = await import("./hub-sync");
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
