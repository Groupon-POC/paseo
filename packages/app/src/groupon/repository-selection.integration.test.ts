// Added for Groupon Desk (fork of Paseo, Apache-2.0): selection through host snapshots, checkout registration and a Mac switch.
/** Covers repository-picker-model, workspace-structure and open-project with daemon I/O at the boundary. */
import { expect, it } from "vitest";
import { openProjectDirectly } from "@/hooks/open-project";
import { buildWorkspaceStructureProjects } from "@/projects/workspace-structure";
import {
  getHostProjectSourceDirectory,
  getWorktreeSupportForHostProject,
} from "@/projects/host-project-model";
import type { ProjectDescriptor } from "@/stores/session-store";
import type { MacPickerOption } from "./mac-picker-model";
import {
  checkoutOnServer,
  entryOfProject,
  paseoPick,
  preselectedRepositoryId,
  repositoryEntries,
  repositoryState,
} from "./repository-picker-model";

const remote = "github.com/groupon/groupon-monorepo";
const studioPath = "/Users/owner/repos/groupon-monorepo";
const mini: ProjectDescriptor = {
  projectId: "mini-folder",
  projectKey: "host:srv_mini:/Users/owner/old/groupon-monorepo",
  projectDisplayName: "groupon-monorepo",
  projectCustomName: null,
  projectRootPath: "/Users/owner/old/groupon-monorepo",
  projectKind: "non_git",
};
const macs: MacPickerOption[] = ["mini", "studio"].map((id) => ({
  id,
  label: id,
  machineIds: [id],
  serverId: `srv_${id}`,
  hostServerId: `srv_${id}`,
  isThisMac: id === "mini",
  state: "connected",
  selectable: true,
  note: null,
  badge: null,
  missingTools: [],
}));
const hubRepositories = [
  { id: "repo", remoteUrl: remote, name: "groupon-monorepo", hidden: false, displayOrder: 0 },
];
const hubCheckouts = [
  { id: "mini-checkout", machine: "mini", repositoryId: "repo", rootPath: mini.projectRootPath },
  { id: "studio-checkout", machine: "studio", repositoryId: "repo", rootPath: studioPath },
];
function projects(studio: ProjectDescriptor[]) {
  return buildWorkspaceStructureProjects({
    sessions: [
      { serverId: "srv_mini", projects: [mini], workspaces: [] },
      { serverId: "srv_studio", projects: studio, workspaces: [] },
    ],
  });
}

it("selects the real Git checkout on Studio when the source Mac has only a plain folder", async () => {
  const initialProjects = projects([]);
  const route = initialProjects.find((row) =>
    row.hosts.some((host) => host.serverId === "srv_mini"),
  )!;
  const initialEntries = repositoryEntries({
    projects: initialProjects,
    hubRepositories,
    hubCheckouts,
    macs,
  });
  const initialEntry = entryOfProject(initialEntries, route)!;
  expect(
    preselectedRepositoryId({
      entries: initialEntries,
      routeProject: route,
      lastActiveProject: null,
      lastRepositoryId: null,
    }),
  ).toBe(`repo:${remote}`);
  const initialCheckout = checkoutOnServer(initialEntry, "srv_studio", macs)!;
  expect(repositoryState(initialEntry, true, initialCheckout, null).kind).toBe("opening");
  expect(
    paseoPick({
      paseoSelectedProject: route,
      paseoProjectByOptionId: new Map(),
      serverId: "srv_studio",
      checkout: initialCheckout,
    }).selectedProject,
  ).toBeNull();

  const registered: ProjectDescriptor[] = [];
  const result = await openProjectDirectly({
    serverId: "srv_studio",
    projectPath: initialCheckout.path,
    isConnected: true,
    canAddProject: true,
    client: {
      addProject: async (path) => ({
        requestId: "add",
        error: null,
        project: {
          projectId: "studio-git",
          projectKey: `remote:${remote}`,
          projectKind: "git",
          projectDisplayName: "groupon-monorepo",
          projectRootPath: path,
        },
      }),
    },
    upsertProject: (serverId, project) => {
      expect(serverId).toBe("srv_studio");
      registered.push(project);
    },
    setHasHydratedWorkspaces: () => {},
  });
  expect(result.ok).toBe(true);

  const updatedProjects = projects(registered);
  const updatedEntries = repositoryEntries({
    projects: updatedProjects,
    hubRepositories,
    hubCheckouts,
    macs,
  });
  const entry = entryOfProject(updatedEntries, route)!;
  const checkout = checkoutOnServer(entry, "srv_studio", macs)!;
  const studio = updatedProjects.find((row) =>
    row.hosts.some((host) => host.projectId === "studio-git"),
  )!;
  const options = new Map([["studio-option", studio]]);
  const wanted = paseoPick({
    paseoSelectedProject: route,
    paseoProjectByOptionId: options,
    serverId: "srv_studio",
    checkout,
  });
  expect(wanted.wantedOptionId).toBe("studio-option");
  const selected = paseoPick({
    paseoSelectedProject: studio,
    paseoProjectByOptionId: options,
    serverId: "srv_studio",
    checkout,
  }).selectedProject!;
  expect(repositoryState(entry, true, checkout, null)).toEqual({ kind: "ready" });
  expect(getHostProjectSourceDirectory(selected, "srv_studio")).toBe(studioPath);
  expect(getWorktreeSupportForHostProject({ project: selected, serverId: "srv_studio" })).toBe(
    "supported",
  );
  expect(registered[0]?.projectId).toBe("studio-git");
  expect(mini.projectKind).toBe("non_git");
});
