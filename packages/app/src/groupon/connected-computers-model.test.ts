// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's Connected computers.
/**
 * Tests for the Connected computers model: online and offline Macs, this computer first, the
 * load on expanding, and a fresher sample winning over the shared list's.
 *
 * Covers: packages/app/src/groupon/connected-computers-model.ts
 */
import { describe, expect, it } from "vitest";
import {
  COMPUTER_ONLINE_MS,
  computerLoadOf,
  connectedComputerRows,
  toggleExpanded,
} from "./connected-computers-model";
import type { HubMachine } from "./hub";
import type { HubMachineView } from "./hub-sync";
import { GROUPON_COMPUTERS } from "./strings";

const NOW = new Date("2026-10-21T12:00:00.000Z");
const secondsAgo = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString();

function machine(overrides: Partial<HubMachine> = {}): HubMachine {
  return {
    machine: "mac-1",
    name: "Tomas - Mac Studio",
    model: "Mac14,13",
    alias: null,
    isPrimary: false,
    lastSeenAt: secondsAgo(5),
    relaySessionId: null,
    relayConnectedAt: null,
    relayOfferSealed: null,
    load: null,
    ...overrides,
  };
}

function view(m: HubMachine, overrides: Partial<HubMachineView> = {}): HubMachineView {
  return {
    machine: m,
    label: m.alias ?? m.name,
    state: "noOffer",
    serverId: null,
    direct: null,
    thisMac: false,
    relay: null,
    error: null,
    ...overrides,
  };
}

const studio = machine({
  machine: "studio",
  name: "Tomas - Mac Studio",
  load: { cpuPercent: 23.4, memoryPercent: 61, sampledAt: secondsAgo(8) },
});
const mini = machine({
  machine: "mini",
  name: "Tomas - Mac Mini",
  lastSeenAt: secondsAgo(5 * 60),
  load: { cpuPercent: 90, memoryPercent: 90, sampledAt: secondsAgo(5 * 60) },
});
const air = machine({
  machine: "air",
  name: "Tomas--MacBook-Air.local",
  lastSeenAt: secondsAgo(3 * 3600),
});

const rows = (
  views: HubMachineView[],
  extra: Partial<Parameters<typeof connectedComputerRows>[0]> = {},
) => connectedComputerRows({ views, isOnline: () => false, now: NOW, ...extra });

describe("connectedComputerRows", () => {
  it("shows an online Mac with its CPU and RAM, and an offline one with when it was last seen", () => {
    const [online, offline] = rows([view(mini), view(studio)]);

    expect(online).toEqual({
      id: "studio",
      label: "Tomas - Mac Studio",
      isThisComputer: false,
      online: true,
      load: {
        cpuPercent: 23.4,
        memoryPercent: 61,
        cpuText: "23%",
        memoryText: "61%",
        cpuLabel: "CPU",
        memoryLabel: "RAM",
        summary: null,
        disk: null,
        network: null,
      },
      note: null,
      missingTools: [],
      fixes: [],
    });
    // Its last sample is five minutes old: offline, and the old figures are not shown.
    expect(offline).toEqual({
      id: "mini",
      label: "Tomas - Mac Mini",
      isThisComputer: false,
      online: false,
      load: null,
      note: GROUPON_COMPUTERS.seen("5 min ago"),
      missingTools: [],
      fixes: [],
    });
  });

  it("puts this computer first, labelled, then those online, then the rest", () => {
    const listed = rows([view(mini), view(studio), view(air, { thisMac: true })]);

    expect(listed.map((row) => [row.id, row.isThisComputer, row.online])).toEqual([
      ["air", true, false],
      ["studio", false, true],
      ["mini", false, false],
    ]);
    expect(listed[0]?.note).toBe(GROUPON_COMPUTERS.seen("3 h ago"));
  });

  it("counts a sample as fresh for 60 s only", () => {
    const at = (seconds: number) =>
      rows([
        view(
          machine({ load: { cpuPercent: 1, memoryPercent: 2, sampledAt: secondsAgo(seconds) } }),
        ),
      ])[0]?.online;

    expect(at(COMPUTER_ONLINE_MS / 1000 - 1)).toBe(true);
    expect(at(COMPUTER_ONLINE_MS / 1000)).toBe(false);
  });

  it("calls a Mac the window is connected to online, and says when its hand sends no reading", () => {
    const connected = view(machine({ machine: "old-hand", load: undefined }), {
      state: "added",
      serverId: "srv_old",
    });

    const [row] = rows([connected], { isOnline: (serverId) => serverId === "srv_old" });

    expect(row).toMatchObject({ online: true, load: null, note: GROUPON_COMPUTERS.noLoad });
  });

  it("takes a sample read since the shared list when it is newer, and keeps the list's when it is not", () => {
    const newer = new Map([
      ["studio", { cpuPercent: 77, memoryPercent: 64, sampledAt: secondsAgo(1) }],
    ]);
    const older = new Map([
      ["studio", { cpuPercent: 5, memoryPercent: 5, sampledAt: secondsAgo(30) }],
    ]);

    expect(rows([view(studio)], { freshLoads: newer })[0]?.load?.cpuText).toBe("77%");
    expect(rows([view(studio)], { freshLoads: older })[0]?.load?.cpuText).toBe("23%");
    // A Mac the shared list holds as offline comes online with a fresh sample.
    expect(
      rows([view(mini)], {
        freshLoads: new Map([
          ["mini", { cpuPercent: 4, memoryPercent: 50, sampledAt: secondsAgo(2) }],
        ]),
      })[0],
    ).toMatchObject({
      online: true,
      load: { cpuText: "4.0%", memoryText: "50%" },
    });
  });

  it("lists one row per Mac, as Your Macs and the Mac picker do", () => {
    const twice = [
      view(studio, { state: "added", serverId: "srv_1" }),
      view(machine({ machine: "studio-old", name: "Old record" }), {
        state: "added",
        serverId: "srv_1",
      }),
    ];

    expect(rows(twice)).toHaveLength(1);
  });
});

describe("toggleExpanded", () => {
  it("opens a closed Mac and closes an open one, leaving the others", () => {
    const opened = toggleExpanded(new Set(["mini"]), "studio");

    expect([...opened].sort()).toEqual(["mini", "studio"]);
    expect([...toggleExpanded(opened, "mini")]).toEqual(["studio"]);
  });
});

describe("connectedComputerRows: the tools a Mac lacks", () => {
  const FIX_GH = "Install it on that Mac: brew install gh, then gh auth login";

  it("labels a Mac without gh and says how to fix it, and leaves a Mac with every tool unlabelled", () => {
    const [missing, complete] = rows([
      view(machine({ machine: "air", name: "Air", missingTools: ["gh"] })),
      view(machine({ machine: "studio", name: "Studio", missingTools: [] })),
    ]);

    expect(missing?.missingTools).toEqual(["gh"]);
    expect(missing?.fixes).toEqual([FIX_GH]);
    expect(complete?.missingTools).toEqual([]);
    expect(complete?.fixes).toEqual([]);
  });

  it("says nothing for a Mac whose hand reports no list (an older hand or an older Core)", () => {
    const [row] = rows([view(machine({ missingTools: undefined }))]);

    expect(row?.missingTools).toEqual([]);
    expect(row?.fixes).toEqual([]);
  });

  it("leaves codex out of the label unless a session on that Mac uses Codex", () => {
    const reported = machine({ machine: "mini", missingTools: ["gh", "codex"] });
    const onMini = view(reported, { state: "added", serverId: "srv_mini" });

    const without = rows([onMini])[0];
    const withCodex = rows([onMini], { codexServerIds: new Set(["srv_mini"]) })[0];
    const elsewhere = rows([onMini], { codexServerIds: new Set(["srv_other"]) })[0];

    expect(without?.missingTools).toEqual(["gh"]);
    expect(elsewhere?.missingTools).toEqual(["gh"]);
    expect(withCodex?.missingTools).toEqual(["gh", "codex"]);
  });

  it("starts each sentence with its tool when several are missing", () => {
    const [row] = rows([view(machine({ missingTools: ["claude", "gh", "git"] }))]);

    expect(row?.missingTools).toEqual(["gh", "git", "claude"]);
    expect(row?.fixes).toEqual([
      `gh: ${FIX_GH}`,
      "git: Install it on that Mac: xcode-select --install",
      "claude: Install it on that Mac: npm install -g @anthropic-ai/claude-code, then claude to sign in",
    ]);
  });

  it("ignores a tool name the window does not know", () => {
    const [row] = rows([view(machine({ missingTools: ["rm -rf", "gh"] }))]);

    expect(row?.missingTools).toEqual(["gh"]);
  });
});

describe("computerLoadOf: the card's figures", () => {
  const whole = {
    cpuPercent: 1.8,
    memoryPercent: 25,
    sampledAt: secondsAgo(3),
    cores: 8,
    memoryUsedBytes: 3.8 * 1024 ** 3,
    memoryTotalBytes: 15.1 * 1024 ** 3,
    diskUsedBytes: 48.6e9,
    diskTotalBytes: 98.3e9,
    netRxBytesPerSecond: 45_800,
    netTxBytesPerSecond: 23_300,
    uptimeSeconds: 3 * 86_400 + 19 * 3_600 + 125,
    loadAverage: [4.51, 3.26, 2.24],
  };

  it("words a whole sample as the card and the strip show it", () => {
    expect(computerLoadOf(whole)).toEqual({
      cpuPercent: 1.8,
      memoryPercent: 25,
      cpuText: "1.8%",
      memoryText: "25%",
      cpuLabel: "CPU · 8 cores",
      memoryLabel: "RAM · 3.8 GB / 15.1 GB",
      summary: "up 3d 19h · load 4.51 3.26 2.24",
      disk: { percent: expect.closeTo(49.44, 2), text: "49%", label: "Disk · 48.6 GB / 98.3 GB" },
      network: { downText: "45.8 KB/s", upText: "23.3 KB/s", compactText: "46K/23K" },
    });
  });

  it("leaves out what an older hand does not send, never showing it as 0", () => {
    const load = computerLoadOf({ cpuPercent: 40, memoryPercent: 50, sampledAt: secondsAgo(3) });

    expect(load).toMatchObject({
      cpuLabel: "CPU",
      memoryLabel: "RAM",
      summary: null,
      disk: null,
      network: null,
    });
  });

  it("says the uptime alone, or the load alone, when only one is sent, and one core as a core", () => {
    expect(computerLoadOf({ ...whole, loadAverage: null }).summary).toBe("up 3d 19h");
    expect(computerLoadOf({ ...whole, uptimeSeconds: null }).summary).toBe("load 4.51 3.26 2.24");
    expect(computerLoadOf({ ...whole, cores: 1 }).cpuLabel).toBe("CPU · 1 core");
  });

  it("puts the strip on a collapsed online row and leaves an offline one without load", () => {
    const [online, offline] = rows([
      view(machine({ machine: "a", load: whole })),
      view(
        machine({
          machine: "b",
          lastSeenAt: secondsAgo(600),
          load: { ...whole, sampledAt: secondsAgo(600) },
        }),
      ),
    ]);

    expect(online?.load?.network?.compactText).toBe("46K/23K");
    expect(offline?.load).toBeNull();
  });
});
