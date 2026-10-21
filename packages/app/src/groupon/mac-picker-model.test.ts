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
    // As the hub sync marks it: a daemon reached directly is this Mac's.
    thisMac: overrides.thisMac ?? (overrides.direct ?? null) !== null,
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

describe("one row per Mac", () => {
  // The owner's dev window, 2026-10-20: Paseo's registry kept the earlier session's direct host,
  // labelled by the hostname, beside the hub's Mac on the same daemon.
  const mini = added("mini", {
    direct: "127.0.0.1:6770",
    machine: machine("mini", {
      alias: "Tomas - Mac Mini in Office Prague",
      relayConnectedAt: "2026-10-20T08:00:00.000Z",
    }),
    label: "Tomas - Mac Mini in Office Prague",
  });
  const registry = [
    { serverId: "srv_mini", label: "CY2T43V547" },
    { serverId: "srv_old_desktop", label: "CY2T43V547" },
  ];

  it("lists a Mac once, by the hub's name, never by the registry's label", () => {
    const options = macPickerOptions([mini], online("srv_mini"), registry, false);
    expect(options.map((option) => [option.id, option.label, option.serverId])).toEqual([
      ["mini", "Tomas - Mac Mini in Office Prague", "srv_mini"],
    ]);
  });

  it("keeps a stored host with no hub Mac behind it out of a release build", () => {
    const options = macPickerOptions([mini], online("srv_mini", "srv_old_desktop"), registry);
    expect(options.some((option) => option.label === "CY2T43V547")).toBe(false);
  });

  it("in a development build lists such a host last, marked stored host, the hub's Mac still once", () => {
    const options = macPickerOptions([mini], online("srv_mini"), registry, true);
    expect(
      options.map((option) => [option.id, option.label, option.selectable, option.note]),
    ).toEqual([
      ["mini", "Tomas - Mac Mini in Office Prague", true, GROUPON_MAC_PICKER.thisMac],
      ["stored:srv_old_desktop", "CY2T43V547", false, GROUPON_MAC_PICKER.storedHost],
    ]);
  });

  it("merges two hub records that name one daemon into one row, the one reached directly", () => {
    const stale = added("mini-old", {
      machine: machine("mini-old", { name: "CY2T43V547", lastSeenAt: "2026-10-19T08:00:00.000Z" }),
      label: "CY2T43V547",
      serverId: "srv_mini",
    });
    const options = macPickerOptions([stale, mini], online("srv_mini"));
    expect(options.map((option) => [option.id, option.label])).toEqual([
      ["mini", "Tomas - Mac Mini in Office Prague"],
    ]);
  });
});

describe("macPickerTriggerLabel", () => {
  it("says On <Mac> by the picker's name for it, never a registry label", () => {
    const options = macPickerOptions([added("studio")], online("srv_studio"));
    expect(macPickerTriggerLabel(options, "srv_studio")).toBe("On Tomas - studio");
    expect(macPickerTriggerLabel(options, "srv_other")).toBe(
      GROUPON_MAC_PICKER.on(GROUPON_MAC_PICKER.unknownMac),
    );
  });
});
