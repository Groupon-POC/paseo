// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's "On <Mac>" picker.
/**
 * Tests for New workspace's Mac picker model.
 *
 * Covers: packages/app/src/groupon/mac-picker-model.ts
 */
import { describe, expect, it } from "vitest";
import type { HubMachine } from "./hub";
import type { HubMachineView } from "./hub-sync";
import { defaultMacServerId, macPickerOptions, macPickerTriggerLabel } from "./mac-picker-model";
import { GROUPON_MAC_PICKER } from "./strings";

function machine(id: string, overrides: Partial<HubMachine> = {}): HubMachine {
  return {
    machine: id,
    name: `Tomas - ${id}`,
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

function view(
  id: string,
  overrides: Partial<HubMachineView> & { machine?: HubMachine } = {},
): HubMachineView {
  const m = overrides.machine ?? machine(id);
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

/** A Mac whose host was added from the hub; `direct` makes it this Mac. */
function added(id: string, extra: Partial<HubMachineView> = {}): HubMachineView {
  return view(id, {
    state: "added",
    serverId: `srv_${id}`,
    relay: "wss://core/relay",
    machine: machine(id, { relayConnectedAt: "2026-10-20T08:00:00.000Z" }),
    ...extra,
  });
}

const online =
  (...ids: string[]) =>
  (serverId: string) =>
    ids.includes(serverId);

describe("macPickerOptions", () => {
  it("lists this Mac first, chosen by its host, then the other connected Macs", () => {
    const options = macPickerOptions(
      [
        added("studio", { machine: machine("studio", { isPrimary: true }) }),
        added("laptop", { direct: "127.0.0.1:6770" }),
      ],
      online("srv_studio", "srv_laptop"),
    );
    expect(options.map((option) => [option.id, option.serverId, option.selectable])).toEqual([
      ["laptop", "srv_laptop", true],
      ["studio", "srv_studio", true],
    ]);
    expect(options[0]?.isThisMac).toBe(true);
    expect(options[0]?.note).toBe(GROUPON_MAC_PICKER.thisMac);
    expect(options[1]?.note).toBeNull();
  });

  it("greys a Mac without a running hand: listed, with the reason, and not choosable", () => {
    const [mac] = macPickerOptions([view("old-mini")], online());
    expect(mac).toMatchObject({
      id: "old-mini",
      serverId: null,
      selectable: false,
      note: GROUPON_MAC_PICKER.noHand,
    });
  });

  it("greys a Mac still connecting, one in another vault and one that failed", () => {
    const options = macPickerOptions(
      [
        added("relay-only"),
        view("sealed", { state: "sealedElsewhere" }),
        view("broken", { state: "failed", error: "bad offer" }),
      ],
      online(),
    );
    expect(options.map((option) => [option.id, option.selectable, option.note])).toEqual([
      ["relay-only", false, GROUPON_MAC_PICKER.connecting],
      ["sealed", false, GROUPON_MAC_PICKER.otherVault],
      ["broken", false, GROUPON_MAC_PICKER.failed],
    ]);
  });

  it("keeps this Mac first even while its hand is not running, greyed", () => {
    const options = macPickerOptions(
      [added("studio"), view("laptop", { direct: "127.0.0.1:6770" })],
      online("srv_studio"),
    );
    expect(options.map((option) => [option.id, option.selectable])).toEqual([
      ["laptop", false],
      ["studio", true],
    ]);
  });
});

describe("defaultMacServerId", () => {
  it("chooses this Mac when it is connected", () => {
    const options = macPickerOptions(
      [added("studio"), added("laptop", { direct: "127.0.0.1:6770" })],
      online("srv_studio", "srv_laptop"),
    );
    expect(defaultMacServerId(options, "srv_studio")).toBe("srv_laptop");
  });

  it("keeps Paseo's choice when this Mac cannot take the task, or there is no hub Mac", () => {
    const options = macPickerOptions(
      [added("studio"), added("laptop", { direct: "127.0.0.1:6770" })],
      online("srv_studio"),
    );
    expect(defaultMacServerId(options, "srv_studio")).toBe("srv_studio");
    expect(defaultMacServerId([], "srv_any")).toBe("srv_any");
  });
});

describe("macPickerTriggerLabel", () => {
  it("says On <Mac>, or the host's own label for a host that is no hub Mac", () => {
    const options = macPickerOptions([added("studio")], online("srv_studio"));
    expect(macPickerTriggerLabel(options, "srv_studio", null)).toBe("On Tomas - studio");
    expect(macPickerTriggerLabel(options, "srv_other", "Build box")).toBe("On Build box");
  });
});
