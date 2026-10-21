// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Macs Add project and From GitHub offer.
/**
 * Tests for the Mac chooser of Add project and From GitHub: this Mac first, greyed with the reason
 * while its hand is not running, enabling when the hand appears, and From GitHub's host step.
 *
 * Covers: packages/app/src/groupon/add-to-mac-model.ts
 */
import { describe, expect, it } from "vitest";
import type { AddProjectHost } from "@/add-project-flow/model";
import {
  addToMacRows,
  addToMacStart,
  firstSelectableRow,
  macsHoldingRepository,
  openAddToMacFlow,
  shouldResyncForThisMac,
  type AddToMacRow,
} from "./add-to-mac-model";
import type { HubMachine, HubRepository } from "./hub";
import type { HubMachineView } from "./hub-sync";
import { macPickerOptions } from "./mac-picker-model";
import { GROUPON_ADD_TO_MAC, GROUPON_MAC_PICKER, GROUPON_THIS_COMPUTER } from "./strings";

function machine(id: string, name: string, overrides: Partial<HubMachine> = {}): HubMachine {
  return {
    machine: id,
    name,
    model: "Mac14,13",
    alias: null,
    isPrimary: false,
    lastSeenAt: "2026-10-21T11:05:00.000Z",
    relaySessionId: null,
    relayConnectedAt: null,
    relayOfferSealed: null,
    ...overrides,
  };
}

/** A hub Mac whose hand serves on the relay. */
function serving(id: string, name: string, extra: Partial<HubMachineView> = {}): HubMachineView {
  return {
    machine: machine(id, name, {
      relaySessionId: `rs_${id}`,
      relayConnectedAt: "2026-10-21T11:05:00.000Z",
      relayOfferSealed: "sealed",
    }),
    label: name,
    state: "added",
    serverId: `srv_${id}`,
    direct: null,
    thisMac: false,
    relay: "wss://core/relay",
    error: null,
    ...extra,
  };
}

/** A hub Mac signed in to Groupon Desk whose hand never registered (no offer, no host). */
function signedInOnly(id: string, name: string, thisMac = false): HubMachineView {
  return {
    machine: machine(id, name),
    label: name,
    state: "noOffer",
    serverId: null,
    direct: null,
    thisMac,
    relay: null,
    error: null,
  };
}

const MINI = "Tomas - Mac Mini in Office Prague";
const PRO = "Tomas - MacBook Pro";
const AIR = "Tomas - MacBook Air";

/** The owner's measured state of 2026-10-21: three Macs on the hub, only the Mini serving. */
const MEASURED: HubMachineView[] = [
  serving("mini", MINI, { machine: machine("mini", MINI, { isPrimary: true }) }),
  signedInOnly("pro", PRO, true),
  signedInOnly("air", AIR),
];

function rowsOf(
  views: readonly HubMachineView[],
  online: readonly string[],
  thisMachineId: string | null = null,
): AddToMacRow[] {
  const isOnline = (serverId: string) => online.includes(serverId);
  return addToMacRows({
    macs: macPickerOptions(views, isOnline),
    canAddTo: isOnline,
    thisMachineId,
  });
}

function host(serverId: string): AddProjectHost {
  return {
    serverId,
    label: serverId,
    canAddProject: true,
    canBrowse: false,
    canCloneGithubRepositories: true,
    canSearchGithubRepositories: true,
    canCreateDirectory: true,
  };
}

describe("addToMacRows", () => {
  it("lists this Mac first even while only another Mac serves, greyed with the reason and the command", () => {
    const rows = rowsOf(MEASURED, ["srv_mini"], "pro");
    expect(rows.map((row) => [row.label, row.selectable, row.note])).toEqual([
      [PRO, false, GROUPON_MAC_PICKER.noHand],
      [MINI, true, null],
      [AIR, false, GROUPON_MAC_PICKER.noHand],
    ]);
    expect(rows.map((row) => row.badge)).toEqual([GROUPON_THIS_COMPUTER, null, null]);
    expect(rows[0]).toMatchObject({
      isThisMac: true,
      serverId: null,
      reason:
        "The hand on this Mac is not running. Press Work window in Groupon Desk, or run groupon desk serve install.",
      command: "groupon desk serve install",
    });
    // Another Mac without its hand says only "hand not running": the way out is on that Mac.
    expect(rows[2]).toMatchObject({ reason: null, command: null });
  });

  it("enables this Mac's row in place once its hand serves and its host is online", () => {
    const before = rowsOf(MEASURED, ["srv_mini"], "pro");
    const after = rowsOf(
      [
        MEASURED[0]!,
        serving("pro", PRO, { thisMac: true, direct: "127.0.0.1:6770" }),
        MEASURED[2]!,
      ],
      ["srv_mini", "srv_pro"],
      "pro",
    );
    expect(before[0]).toMatchObject({ id: "pro", selectable: false });
    expect(after[0]).toMatchObject({
      id: "pro",
      selectable: true,
      serverId: "srv_pro",
      note: null,
      badge: GROUPON_THIS_COMPUTER,
      reason: null,
      command: null,
    });
  });

  it("keeps this Mac greyed as connecting while its host is added but not online yet", () => {
    const rows = rowsOf(
      [serving("pro", PRO, { thisMac: true, direct: "127.0.0.1:6770" }), MEASURED[0]!],
      ["srv_mini"],
      "pro",
    );
    expect(rows[0]).toMatchObject({
      id: "pro",
      selectable: false,
      note: GROUPON_MAC_PICKER.connecting,
      badge: GROUPON_THIS_COMPUTER,
      reason: null,
    });
  });

  it("shows a This Mac row when the desktop window's Mac is not on the hub yet", () => {
    const rows = rowsOf([MEASURED[0]!], ["srv_mini"], "never-registered");
    expect(rows.map((row) => [row.id, row.label, row.selectable])).toEqual([
      ["this-mac:never-registered", GROUPON_ADD_TO_MAC.thisMac, false],
      ["mini", MINI, true],
    ]);
    expect(rows[0]?.command).toBe(GROUPON_ADD_TO_MAC.noHandCommand);
    // The generic name already says it: no green label beside "This Mac".
    expect(rows.map((row) => row.badge)).toEqual([null, null]);
  });

  it("adds no This Mac row outside the desktop app (the web build knows no Mac of its own)", () => {
    const rows = rowsOf([MEASURED[0]!, MEASURED[2]!], ["srv_mini"], null);
    expect(rows.map((row) => row.id)).toEqual(["mini", "air"]);
    expect(rows.some((row) => row.isThisMac)).toBe(false);
  });
});

describe("addToMacStart", () => {
  it("never opens on the only serving Mac when this Mac's hand is not running (the complaint)", () => {
    const rows = rowsOf(MEASURED, ["srv_mini"], "pro");
    expect(addToMacStart({ rows, intent: "project" })).toBeNull();
  });

  it("opens on this Mac when it serves, and on the Mac the caller named before that", () => {
    const rows = rowsOf(
      [MEASURED[0]!, serving("pro", PRO, { thisMac: true, direct: "127.0.0.1:6770" })],
      ["srv_mini", "srv_pro"],
      "pro",
    );
    expect(addToMacStart({ rows, intent: "project" })).toBe("srv_pro");
    expect(addToMacStart({ rows, intent: "project", preferredHostId: "srv_mini" })).toBe(
      "srv_mini",
    );
    // A named Mac that cannot be chosen does not win over this Mac.
    expect(addToMacStart({ rows, intent: "project", preferredHostId: "srv_air" })).toBe("srv_pro");
  });

  it("opens on the one serving Mac only in a window that is on no Mac", () => {
    const rows = rowsOf([MEASURED[0]!, MEASURED[2]!], ["srv_mini"], null);
    expect(addToMacStart({ rows, intent: "project" })).toBe("srv_mini");
  });

  it("always shows From GitHub's host step, whatever serves", () => {
    const rows = rowsOf(
      [serving("pro", PRO, { thisMac: true, direct: "127.0.0.1:6770" })],
      ["srv_pro"],
      "pro",
    );
    expect(addToMacStart({ rows, intent: "github", preferredHostId: "srv_pro" })).toBeNull();
  });
});

describe("openAddToMacFlow", () => {
  it("opens on the list of Macs when there is no start Mac", () => {
    const state = openAddToMacFlow([host("srv_mini")], null);
    expect(state.pages.map((page) => page.kind)).toEqual(["host"]);
    expect(state.hosts.map((candidate) => candidate.serverId)).toEqual(["srv_mini"]);
  });

  it("puts the start Mac's methods on top of the list, so Back reaches the other Macs", () => {
    const state = openAddToMacFlow([host("srv_mini"), host("srv_pro")], "srv_pro");
    expect(state.pages.map((page) => page.kind)).toEqual(["host", "method"]);
    expect(state.pages[1]).toMatchObject({ hostId: "srv_pro" });
  });

  it("stays on the list when the start Mac is not an available host", () => {
    expect(openAddToMacFlow([host("srv_mini")], "srv_pro").pages).toHaveLength(1);
  });
});

describe("firstSelectableRow", () => {
  it("skips greyed rows, and falls back to the first when none can be chosen", () => {
    expect(firstSelectableRow([{ disabled: true }, {}, {}])).toBe(1);
    expect(firstSelectableRow([{ disabled: true }, { disabled: true }])).toBe(0);
  });
});

describe("shouldResyncForThisMac", () => {
  const greyed = rowsOf(MEASURED, ["srv_mini"], "pro");
  it("reads the hub again once this Mac's daemon answers while its row is greyed", () => {
    expect(shouldResyncForThisMac(greyed, 1)).toBe(true);
    expect(shouldResyncForThisMac(greyed, 0)).toBe(false);
  });
  it("does nothing once this Mac can be chosen, or when no row is this Mac", () => {
    const ready = rowsOf(
      [serving("pro", PRO, { thisMac: true, direct: "127.0.0.1:6770" })],
      ["srv_pro"],
      "pro",
    );
    expect(shouldResyncForThisMac(ready, 1)).toBe(false);
    expect(shouldResyncForThisMac(rowsOf([MEASURED[0]!], ["srv_mini"]), 1)).toBe(false);
  });
});

describe("macsHoldingRepository (From GitHub's folder step)", () => {
  const repository = (id: string, remoteUrl: string): HubRepository => ({
    id,
    remoteUrl,
    name: remoteUrl.split("/").pop() ?? remoteUrl,
    hidden: false,
    displayOrder: 0,
  });
  const repositories = [
    repository("r1", "github.com/groupon2/engineering-development"),
    repository("r2", "github.com/groupon2/other"),
  ];
  const macs = [
    { machineId: "mini", label: MINI, serverId: "srv_mini", isThisMac: false },
    { machineId: "pro", label: PRO, serverId: "srv_pro", isThisMac: true },
    { machineId: "air", label: AIR, serverId: null, isThisMac: false },
  ];
  const checkouts = [
    { id: "c1", machine: "air", repositoryId: "r1", rootPath: "~/src/engineering-development" },
    {
      id: "c2",
      machine: "mini",
      repositoryId: "r1",
      rootPath: "~/Documents/GitHub/engineering-development",
    },
    { id: "c3", machine: "pro", repositoryId: "r2", rootPath: "~/Documents/GitHub/other" },
  ];

  it("names each Mac that has the repository with its path, the Mac being cloned to first", () => {
    expect(
      macsHoldingRepository({
        repositories,
        checkouts,
        macs,
        githubHost: "github.com",
        fullName: "groupon2/Engineering-Development",
        chosenServerId: "srv_mini",
      }),
    ).toEqual([
      { label: MINI, path: "~/Documents/GitHub/engineering-development", isChosen: true },
      { label: AIR, path: "~/src/engineering-development", isChosen: false },
    ]);
  });

  it("is empty for a repository no Mac holds, and for another GitHub host", () => {
    const base = { repositories, checkouts, macs, chosenServerId: "srv_pro" };
    expect(
      macsHoldingRepository({ ...base, githubHost: "github.com", fullName: "groupon2/none" }),
    ).toEqual([]);
    expect(
      macsHoldingRepository({
        ...base,
        githubHost: "github.groupondev.com",
        fullName: "groupon2/engineering-development",
      }),
    ).toEqual([]);
  });
});
