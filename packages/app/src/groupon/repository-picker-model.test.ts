// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's Repository field.
/**
 * Tests for the Repository field's model: one repository on every Mac.
 *
 * Covers: packages/app/src/groupon/repository-picker-model.ts
 */
import { describe, expect, it } from "vitest";
import type { HostProjectListItem } from "@/projects/host-project-model";
import type { HubCheckout, HubMachine, HubRepository } from "./hub";
import type { HubMachineView } from "./hub-sync";
import { macPickerOptions } from "./mac-picker-model";
import {
  cloneTargetOf,
  defaultMacForRepository,
  entryOfProject,
  macRepositoryNote,
  normaliseRemote,
  paseoPick,
  preselectedRepositoryId,
  repositoryDescription,
  repositoryEntries,
  repositoryState,
  shortPath,
} from "./repository-picker-model";
import { GROUPON_MAC_PICKER, GROUPON_REPOSITORY_PICKER } from "./strings";

function machine(id: string, name: string): HubMachine {
  return {
    machine: id,
    name,
    model: "Mac14,13",
    alias: null,
    isPrimary: id === "mini",
    lastSeenAt: "2026-10-20T08:00:00.000Z",
    relaySessionId: `srv_${id}`,
    relayConnectedAt: "2026-10-20T08:00:00.000Z",
    relayOfferSealed: "sealed",
  };
}

function added(id: string, name: string, extra: Partial<HubMachineView> = {}): HubMachineView {
  return {
    machine: machine(id, name),
    label: name,
    state: "added",
    serverId: `srv_${id}`,
    direct: null,
    relay: "wss://core/relay",
    error: null,
    ...extra,
    // As the hub sync marks it: a daemon reached directly is this Mac's.
    thisMac: extra.thisMac ?? (extra.direct ?? null) !== null,
  };
}

/**
 * The owner's second Mac: the window runs on the MacBook Air (this Mac, reached directly), the
 * Mac Mini in the office is on the relay. A third hub Mac runs no hand.
 */
const VIEWS: HubMachineView[] = [
  added("mini", "Tomas - Mac Mini in Office"),
  added("air", "Tomas - MacBook Air", { direct: "127.0.0.1:6770" }),
  {
    ...added("studio", "Tomas - Mac Studio"),
    state: "noOffer",
    serverId: null,
    relay: null,
  },
];
const allOnline = (serverId: string) => serverId === "srv_mini" || serverId === "srv_air";
const MACS = macPickerOptions(VIEWS, allOnline);

function project(
  name: string,
  projectKey: string | null,
  hosts: { serverId: string; projectId: string; path: string }[],
): HostProjectListItem {
  return {
    viewKey: projectKey ?? JSON.stringify([hosts[0]?.serverId, hosts[0]?.projectId]),
    projectKey,
    projectName: name,
    projectKind: "git",
    iconWorkingDir: hosts[0]?.path ?? "",
    hosts: hosts.map((host) => ({
      serverId: host.serverId,
      projectId: host.projectId,
      iconWorkingDir: host.path,
      worktreeSupport: "supported",
    })),
    workspaceKeys: [],
  };
}

const MONOREPO = project(
  "monorepo-development",
  "remote:github.com/groupon2/engineering-development",
  [
    {
      serverId: "srv_mini",
      projectId: "p_mono_mini",
      path: "/Users/c_tzaruba/Documents/GitHub/engineering-development",
    },
  ],
);
const SCRATCH = project("scratch", "host:srv_mini:/Users/c_tzaruba/scratch", [
  { serverId: "srv_mini", projectId: "p_scratch", path: "/Users/c_tzaruba/scratch" },
]);

const HUB_REPOSITORIES: HubRepository[] = [
  {
    id: "r_mono",
    remoteUrl: "github.com/groupon2/engineering-development",
    name: "engineering-development",
    hidden: false,
    displayOrder: 0,
  },
  {
    id: "r_infra",
    remoteUrl: "github.com/groupon2/infra-development",
    name: "infra-development",
    hidden: false,
    displayOrder: 1,
  },
  {
    id: "r_hidden",
    remoteUrl: "github.com/groupon2/old-thing",
    name: "old-thing",
    hidden: true,
    displayOrder: 2,
  },
];
const HUB_CHECKOUTS: HubCheckout[] = [
  {
    id: "c1",
    machine: "mini",
    repositoryId: "r_mono",
    rootPath: "/Users/c_tzaruba/Documents/GitHub/engineering-development",
  },
  {
    id: "c2",
    machine: "air",
    repositoryId: "r_mono",
    rootPath: "/Users/tomas/Documents/GitHub/engineering-development",
  },
  {
    id: "c3",
    machine: "mini",
    repositoryId: "r_infra",
    rootPath: "/Users/c_tzaruba/Documents/GitHub/infra-development",
  },
  { id: "c4", machine: "mini", repositoryId: "r_hidden", rootPath: "/Users/c_tzaruba/old" },
];

const ENTRIES = repositoryEntries({
  projects: [MONOREPO, SCRATCH],
  hubRepositories: HUB_REPOSITORIES,
  hubCheckouts: HUB_CHECKOUTS,
  macs: MACS,
});
const byId = (id: string) => ENTRIES.find((entry) => entry.id === id)!;

describe("repositoryEntries", () => {
  it("uses the hub checkout identity when an older daemon omits the project's remote", () => {
    const legacy = { ...MONOREPO, projectKey: null, viewKey: "legacy-mini-project" };
    const entries = repositoryEntries({
      projects: [legacy],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: HUB_CHECKOUTS,
      macs: MACS,
    });

    const entry = entryOfProject(entries, legacy);
    expect(entry?.id).toBe("repo:github.com/groupon2/engineering-development");
    expect(entry?.checkouts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ serverId: "srv_mini", projectId: "p_mono_mini" }),
        expect.objectContaining({ serverId: "srv_air", path: HUB_CHECKOUTS[1]!.rootPath }),
      ]),
    );
    expect(entries.filter((row) => row.project === legacy)).toHaveLength(1);
    expect(
      preselectedRepositoryId({
        entries,
        routeProject: legacy,
        lastActiveProject: null,
        lastRepositoryId: null,
      }),
    ).toBe(entry?.id);
  });

  it("keeps both daemon project ids when a legacy project is selected on another Mac", () => {
    const mini = { ...MONOREPO, projectKey: null, viewKey: "legacy-mini" };
    const air = project("same-repository-renamed", null, [
      {
        serverId: "srv_air",
        projectId: "p_mono_air",
        path: HUB_CHECKOUTS[1]!.rootPath,
      },
    ]);
    const entries = repositoryEntries({
      projects: [mini, air],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: HUB_CHECKOUTS,
      macs: MACS,
    });
    const entry = entryOfProject(entries, mini)!;
    const checkout = entry.checkouts.find((row) => row.serverId === "srv_air")!;
    const pick = paseoPick({
      paseoSelectedProject: air,
      paseoProjectByOptionId: new Map([["air-option", air]]),
      serverId: "srv_air",
      checkout,
    });

    expect(entryOfProject(entries, air)).toBe(entry);
    expect(pick.selectedProject).toBe(air);
    expect(repositoryState(entry, true, checkout, null)).toEqual({ kind: "ready" });
  });

  it.each([
    { name: "same path on a different Mac", machine: "air", path: MONOREPO.iconWorkingDir },
    {
      name: "same folder name at another path",
      machine: "mini",
      path: "/elsewhere/engineering-development",
    },
  ])("does not guess the repository from $name", ({ machine: machineId, path }) => {
    const legacy = { ...MONOREPO, projectKey: null };
    const entries = repositoryEntries({
      projects: [legacy],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: [{ ...HUB_CHECKOUTS[0]!, machine: machineId, rootPath: path }],
      macs: MACS,
    });

    expect(entryOfProject(entries, legacy)?.remote).toBeNull();
  });

  it("leaves an explicit repository subdirectory separate from its reported root", () => {
    const subdirectory = { ...MONOREPO, projectKey: `${MONOREPO.projectKey}#subdir:apps/admin` };
    const entries = repositoryEntries({
      projects: [subdirectory],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: HUB_CHECKOUTS,
      macs: MACS,
    });

    expect(entryOfProject(entries, subdirectory)?.remote).toBeNull();
  });

  it("does not choose between conflicting hub identities for the same Mac and path", () => {
    const legacy = { ...MONOREPO, projectKey: null };
    const entries = repositoryEntries({
      projects: [legacy],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: [HUB_CHECKOUTS[0]!, { ...HUB_CHECKOUTS[0]!, repositoryId: "r_infra" }],
      macs: MACS,
    });

    expect(entryOfProject(entries, legacy)?.remote).toBeNull();
  });

  it("lists each repository once by owner/name, then the folder with no remote", () => {
    expect(ENTRIES.map((entry) => [entry.id, entry.label])).toEqual([
      ["repo:github.com/groupon2/engineering-development", "groupon2/engineering-development"],
      ["repo:github.com/groupon2/infra-development", "groupon2/infra-development"],
      [`folder:${SCRATCH.viewKey}`, "scratch"],
    ]);
  });

  it("gives a repository on two Macs both checkouts, this Mac first, Paseo's project kept", () => {
    const mono = byId("repo:github.com/groupon2/engineering-development");
    expect(mono.project).toBe(MONOREPO);
    expect(mono.checkouts).toEqual([
      {
        macId: "air",
        serverId: "srv_air",
        macLabel: "Tomas - MacBook Air",
        path: "/Users/tomas/Documents/GitHub/engineering-development",
        projectId: null,
      },
      {
        macId: "mini",
        serverId: "srv_mini",
        macLabel: "Tomas - Mac Mini in Office",
        path: "/Users/c_tzaruba/Documents/GitHub/engineering-development",
        projectId: "p_mono_mini",
      },
    ]);
  });

  it("yields a Paseo project whose folder moved to the hub's checkout of the same Mac", () => {
    // The Mini's repository moved on 2026-11-03; Paseo's project still names the old folder,
    // the hand reports the new one every ten minutes.
    const moved = repositoryEntries({
      projects: [MONOREPO],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: [
        {
          id: "c1",
          machine: "mini",
          repositoryId: "r_mono",
          rootPath: "/Users/c_tzaruba/Documents/GitHub/groupon2/engineering-development/",
        },
      ],
      macs: MACS,
    });
    const mono = moved.find(
      (entry) => entry.id === "repo:github.com/groupon2/engineering-development",
    )!;
    expect(mono.project).toBe(MONOREPO);
    expect(mono.checkouts).toEqual([
      {
        macId: "mini",
        serverId: "srv_mini",
        macLabel: "Tomas - Mac Mini in Office",
        path: "/Users/c_tzaruba/Documents/GitHub/groupon2/engineering-development/",
        projectId: null,
      },
    ]);
  });

  it("keeps a Paseo project the hand never found when the hub knows the repository on no other path of that Mac", () => {
    const deep = repositoryEntries({
      projects: [MONOREPO],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: HUB_CHECKOUTS.filter((checkout) => checkout.machine !== "mini"),
      macs: MACS,
    });
    const mono = deep.find(
      (entry) => entry.id === "repo:github.com/groupon2/engineering-development",
    )!;
    expect(mono.checkouts.map((checkout) => [checkout.macId, checkout.projectId])).toEqual([
      ["air", null],
      ["mini", "p_mono_mini"],
    ]);
  });

  it("lists a repository only the hub knows, on its one Mac, with no Paseo project", () => {
    const infra = byId("repo:github.com/groupon2/infra-development");
    expect(infra.project).toBeNull();
    expect(infra.checkouts.map((checkout) => [checkout.macId, checkout.projectId])).toEqual([
      ["mini", null],
    ]);
  });

  it("keeps a folder with no remote under its own Mac and leaves out a hidden repository", () => {
    const scratch = byId(`folder:${SCRATCH.viewKey}`);
    expect(scratch.remote).toBeNull();
    expect(repositoryDescription(scratch)).toBe("Tomas - Mac Mini in Office · ~/scratch");
    expect(ENTRIES.some((entry) => entry.label.includes("old-thing"))).toBe(false);
  });

  it("reads Paseo's key and the hub's remote as one identity", () => {
    expect(normaliseRemote("remote:github.com/Groupon2/Engineering-Development.git/")).toBe(
      "github.com/groupon2/engineering-development",
    );
    expect(normaliseRemote("remote:github.com/groupon2/mono#subdir:apps/x")).toBeNull();
    expect(normaliseRemote("/Users/t/scratch")).toBeNull();
  });
});

describe("preselectedRepositoryId", () => {
  it('never opens New workspace on New chat\'s "No project" unless the route names it', () => {
    const chats = project("No project", null, [
      { serverId: "srv_mini", projectId: "p_chats", path: "/Users/t/.groupon/paseo/chats" },
    ]);
    const entries = repositoryEntries({
      projects: [MONOREPO, chats],
      hubRepositories: HUB_REPOSITORIES,
      hubCheckouts: HUB_CHECKOUTS,
      macs: MACS,
    });
    const chatsId = `folder:${chats.viewKey}`;

    expect(
      preselectedRepositoryId({
        entries,
        routeProject: null,
        lastActiveProject: chats,
        lastRepositoryId: chatsId,
      }),
    ).toBeNull();
    expect(
      preselectedRepositoryId({
        entries,
        routeProject: chats,
        lastActiveProject: null,
        lastRepositoryId: null,
      }),
    ).toBe(chatsId);
  });

  it("opens on the repository of the group New workspace was pressed in", () => {
    const routeProject = project("monorepo-development", null, [
      { serverId: "srv_mini", projectId: "p_mono_mini", path: "/x" },
    ]);
    // The route's project is resolved to Paseo's grouped project before it gets here.
    expect(
      preselectedRepositoryId({
        entries: ENTRIES,
        routeProject: MONOREPO,
        lastActiveProject: SCRATCH,
        lastRepositoryId: "repo:github.com/groupon2/infra-development",
      }),
    ).toBe("repo:github.com/groupon2/engineering-development");
    expect(entryOfProject(ENTRIES, routeProject)?.id).toBe(
      "repo:github.com/groupon2/engineering-development",
    );
  });

  it("falls back to the last workspace's repository, then to the last repository chosen", () => {
    expect(
      preselectedRepositoryId({
        entries: ENTRIES,
        routeProject: null,
        lastActiveProject: SCRATCH,
        lastRepositoryId: null,
      }),
    ).toBe(`folder:${SCRATCH.viewKey}`);
    expect(
      preselectedRepositoryId({
        entries: ENTRIES,
        routeProject: null,
        lastActiveProject: null,
        lastRepositoryId: "repo:github.com/groupon2/infra-development",
      }),
    ).toBe("repo:github.com/groupon2/infra-development");
    expect(
      preselectedRepositoryId({
        entries: ENTRIES,
        routeProject: null,
        lastActiveProject: null,
        lastRepositoryId: "repo:github.com/gone/away",
      }),
    ).toBeNull();
  });
});

describe("defaultMacForRepository", () => {
  it("stays on this Mac when it holds the repository", () => {
    expect(
      defaultMacForRepository(byId("repo:github.com/groupon2/engineering-development"), MACS),
    ).toBe("srv_air");
  });

  it("goes to the first Mac that holds it when this Mac does not", () => {
    expect(defaultMacForRepository(byId("repo:github.com/groupon2/infra-development"), MACS)).toBe(
      "srv_mini",
    );
  });

  it("has no Mac when only a Mac that cannot be chosen holds it", () => {
    const offline = macPickerOptions(VIEWS, (serverId) => serverId === "srv_air");
    expect(
      defaultMacForRepository(byId("repo:github.com/groupon2/infra-development"), offline),
    ).toBeNull();
  });
});

describe("macRepositoryNote", () => {
  const [air, mini, studio] = MACS;
  const infra = byId("repo:github.com/groupon2/infra-development");

  it("says where a Mac holds the chosen repository, and which Mac lacks it and can clone it", () => {
    expect(macRepositoryNote(mini!, infra)).toBe(
      GROUPON_REPOSITORY_PICKER.holds("~/Documents/GitHub/infra-development"),
    );
    expect(macRepositoryNote(air!, infra)).toBe(GROUPON_REPOSITORY_PICKER.missingCloneable);
  });

  it("keeps the hand's reason on a Mac that cannot be chosen", () => {
    expect(macRepositoryNote(studio!, infra)).toBe(GROUPON_MAC_PICKER.noHand);
  });

  it("does not offer a clone of a folder with no remote", () => {
    expect(macRepositoryNote(air!, byId(`folder:${SCRATCH.viewKey}`))).toBe(
      GROUPON_REPOSITORY_PICKER.missing,
    );
  });
});

describe("cloneTargetOf and shortPath", () => {
  it("clones owner/name from the repository's host", () => {
    expect(cloneTargetOf({ remote: "github.groupondev.com/mobile-next/next-pwa-app" })).toEqual({
      host: "github.groupondev.com",
      fullName: "mobile-next/next-pwa-app",
    });
    expect(cloneTargetOf({ remote: null })).toBeNull();
    expect(cloneTargetOf({ remote: "gitlab.com/group/sub/repo" })).toBeNull();
  });

  it("writes a home folder as ~", () => {
    expect(shortPath("/Users/tomas/Documents/GitHub/x")).toBe("~/Documents/GitHub/x");
    expect(shortPath("/opt/src/x")).toBe("/opt/src/x");
  });
});

describe("repositoryState and paseoPick", () => {
  const mono = byId("repo:github.com/groupon2/engineering-development");
  const infra = byId("repo:github.com/groupon2/infra-development");
  const [onAir, onMini] = mono.checkouts;

  it("is ready where Paseo lists the checkout, and keeps Paseo's pick only when it is that project", () => {
    expect(repositoryState(mono, true, onMini!, null)).toEqual({ kind: "ready" });
    const byOption = new Map([
      [`project:${MONOREPO.viewKey}`, MONOREPO],
      ["project:s", SCRATCH],
    ]);
    expect(
      paseoPick({
        paseoSelectedProject: MONOREPO,
        paseoProjectByOptionId: byOption,
        serverId: "srv_mini",
        checkout: onMini!,
      }),
    ).toEqual({ selectedProject: MONOREPO, wantedOptionId: null });
    // Paseo fell back to another project on this Mac: no project, and the one to pick instead.
    expect(
      paseoPick({
        paseoSelectedProject: SCRATCH,
        paseoProjectByOptionId: byOption,
        serverId: "srv_mini",
        checkout: onMini!,
      }),
    ).toEqual({ selectedProject: null, wantedOptionId: `project:${MONOREPO.viewKey}` });
  });

  it("opens a checkout only the hub reports, and says so when that fails", () => {
    expect(repositoryState(mono, true, onAir!, null)).toEqual({ kind: "opening", checkout: onAir });
    expect(repositoryState(mono, true, onAir!, "no such folder")).toEqual({
      kind: "openFailed",
      checkout: onAir,
      reason: "no such folder",
    });
    expect(
      paseoPick({
        paseoSelectedProject: SCRATCH,
        paseoProjectByOptionId: new Map(),
        serverId: "srv_air",
        checkout: onAir!,
      }),
    ).toEqual({ selectedProject: null, wantedOptionId: null });
  });

  it("offers the clone on a connected Mac that lacks the repository, never another repository", () => {
    expect(repositoryState(infra, true, null, null)).toEqual({ kind: "missing", cloneable: true });
    expect(repositoryState(byId(`folder:${SCRATCH.viewKey}`), true, null, null)).toEqual({
      kind: "missing",
      cloneable: false,
    });
    expect(
      paseoPick({
        paseoSelectedProject: MONOREPO,
        paseoProjectByOptionId: new Map(),
        serverId: "srv_air",
        checkout: null,
      }).selectedProject,
    ).toBeNull();
  });

  it("says nothing while no connected Mac is chosen", () => {
    expect(repositoryState(infra, false, null, null)).toEqual({ kind: "none" });
  });
});
