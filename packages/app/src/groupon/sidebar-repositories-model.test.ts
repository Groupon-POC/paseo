// Added for Groupon Desk (fork of Paseo, Apache-2.0): duplicate repository headings retain all checkouts and chats.
/** Covers sidebar-repositories-model through the real workspace-structure and sidebar placement builders. */
import { expect, it } from "vitest";
import { buildWorkspaceStructureProjects } from "@/projects/workspace-structure";
import { buildSidebarWorkspacePlacementModel } from "@/hooks/sidebar-workspaces-view-model";
import type { ProjectDescriptor } from "@/stores/session-store";
import type { MacPickerOption } from "./mac-picker-model";
import { repositoryEntries } from "./repository-picker-model";
import { groupSidebarRepositories } from "./sidebar-repositories-model";

const remote = "github.com/groupon2/engineering-development";
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
function descriptor(id: string, path: string, projectKey = `remote:${remote}`): ProjectDescriptor {
  return {
    projectId: id,
    projectKey,
    projectDisplayName: "engineering-development",
    projectCustomName: null,
    projectRootPath: path,
    projectKind: "git",
  };
}

it("shows one heading for two checkouts of the same repository on one Mac without losing either chat", () => {
  const first = descriptor("first", "/Users/owner/repos/engineering-development");
  const second = descriptor("second", "/Users/owner/another/engineering-development");
  const projects = buildWorkspaceStructureProjects({
    sessions: [{ serverId: "srv_mini", projects: [first, second], workspaces: [] }],
  });
  for (const [index, project] of projects.entries())
    project.workspaceKeys = [`srv_mini:chat-${index}`];
  const model = buildSidebarWorkspacePlacementModel({ projects });
  expect(model.projects).toHaveLength(2);
  const repositories = repositoryEntries({ projects, hubRepositories: [], hubCheckouts: [], macs });

  const grouped = groupSidebarRepositories({ model, projects, repositories });

  expect(grouped.projects).toHaveLength(1);
  expect(grouped.projects[0]?.hosts.map((host) => host.projectId)).toEqual(["first", "second"]);
  expect(grouped.workspaces.map((row) => row.workspaceKey)).toEqual([
    "srv_mini:chat-0",
    "srv_mini:chat-1",
  ]);
  expect(new Set(grouped.workspaces.map((row) => row.projectViewKey))).toEqual(
    new Set([`remote:${remote}`]),
  );
  expect(model.projects).toHaveLength(2);
});

it("joins the hub-identified plain folder with the Git project on another Mac and retains the source chat", () => {
  const folder = {
    ...descriptor(
      "legacy",
      "/Users/owner/old/engineering-development",
      "host:srv_mini:/Users/owner/old/engineering-development",
    ),
    projectKind: "non_git" as const,
  };
  const git = descriptor("studio-git", "/Users/owner/repos/engineering-development");
  const projects = buildWorkspaceStructureProjects({
    sessions: [
      { serverId: "srv_mini", projects: [folder], workspaces: [] },
      { serverId: "srv_studio", projects: [git], workspaces: [] },
    ],
  });
  for (const project of projects) {
    project.workspaceKeys =
      project.projectKind === "non_git" ? ["srv_mini:existing-chat"] : ["srv_studio:existing-chat"];
  }
  const model = buildSidebarWorkspacePlacementModel({ projects });
  const repositories = repositoryEntries({
    projects,
    hubRepositories: [
      {
        id: "repo",
        remoteUrl: remote,
        name: "engineering-development",
        hidden: false,
        displayOrder: 0,
      },
    ],
    hubCheckouts: [
      { id: "checkout", repositoryId: "repo", machine: "mini", rootPath: folder.projectRootPath },
    ],
    macs,
  });

  const grouped = groupSidebarRepositories({ model, projects, repositories });

  expect(grouped.projects).toHaveLength(1);
  expect(grouped.projects[0]?.projectKind).toBe("git");
  expect(grouped.projects[0]?.iconWorkingDir).toBe(git.projectRootPath);
  expect(grouped.projects[0]?.hosts.map((host) => host.projectId)).toEqual([
    "studio-git",
    "legacy",
  ]);
  expect(grouped.workspaces[0]).toMatchObject({
    workspaceKey: "srv_mini:existing-chat",
    serverId: "srv_mini",
    workspaceId: "existing-chat",
    projectKind: "non_git",
    projectRootPath: folder.projectRootPath,
  });
  expect(grouped.workspaces.map((row) => row.workspaceKey).sort()).toEqual([
    "srv_mini:existing-chat",
    "srv_studio:existing-chat",
  ]);
  expect(grouped.projectNamesByViewKey.get(`remote:${remote}`)).toBe("engineering-development");
});

it("does not merge equal names belonging to different remotes, unknown folders or repository subdirectories", () => {
  const descriptors = [
    descriptor("one", "/one"),
    descriptor("other-remote", "/two", "remote:github.com/another/engineering-development"),
    descriptor("plain", "/three", "host:srv_mini:/three"),
    descriptor("subdir", "/one/packages/app", `remote:${remote}#subdir:packages/app`),
  ];
  const projects = buildWorkspaceStructureProjects({
    sessions: [{ serverId: "srv_mini", projects: descriptors, workspaces: [] }],
  });
  const model = buildSidebarWorkspacePlacementModel({ projects });
  const repositories = repositoryEntries({ projects, hubRepositories: [], hubCheckouts: [], macs });

  const grouped = groupSidebarRepositories({ model, projects, repositories });

  expect(grouped).toBe(model);
  expect(grouped.projects).toHaveLength(4);
});
