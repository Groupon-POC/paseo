// Added for Groupon Desk (fork of Paseo, Apache-2.0): one sidebar section per repository, preserving host-local project and workspace identities.
/** Groups repository headings without changing daemon projects or moving their workspaces. */
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
  SidebarWorkspacePlacementModel,
} from "@/hooks/sidebar-workspaces-view-model";
import type { HostProjectListItem } from "@/projects/host-project-model";
import { entryOfProject, type RepositoryEntry } from "./repository-picker-model";

interface SidebarRepositoryInput {
  model: SidebarWorkspacePlacementModel;
  projects: readonly HostProjectListItem[];
  repositories: readonly RepositoryEntry[];
}

export function groupSidebarRepositories(
  input: SidebarRepositoryInput,
): SidebarWorkspacePlacementModel {
  const byView = new Map(input.projects.map((project) => [project.viewKey, project]));
  const groups = new Map<string, SidebarProjectEntry[]>();
  for (const project of input.model.projects) {
    const source = byView.get(project.viewKey) ?? null;
    const repository = entryOfProject(input.repositories, source);
    const key = repository?.remote ? `remote:${repository.remote}` : project.viewKey;
    const group = groups.get(key);
    if (group) group.push(project);
    else groups.set(key, [project]);
  }
  const projects = [...groups].map(([key, rows]) => mergeRepositoryGroup(key, rows));
  if (
    projects.length === input.model.projects.length &&
    projects.every((project, index) => project === input.model.projects[index])
  )
    return input.model;
  return {
    projects,
    workspaces: projects.flatMap((project) => project.workspaces),
    projectNamesByViewKey: new Map(
      projects.map((project) => [project.viewKey, project.projectName]),
    ),
  };
}

function mergeRepositoryGroup(key: string, rows: SidebarProjectEntry[]): SidebarProjectEntry {
  const first = rows[0];
  if (!first) throw new Error("A sidebar repository group must have a project");
  if (rows.length === 1 && first.viewKey === key) return first;
  // A live Git checkout supplies the heading and icon ahead of a stale plain-folder record.
  const primary =
    rows.find((row) => row.projectKind === "git" && row.viewKey === key) ??
    rows.find((row) => row.projectKind === "git") ??
    first;
  const ordered = [primary, ...rows.filter((row) => row !== primary)];
  const hosts = new Map<string, SidebarProjectEntry["hosts"][number]>();
  const workspaces = new Map<string, SidebarWorkspacePlacement>();
  for (const row of ordered) {
    for (const host of row.hosts) {
      const hostKey = `${host.serverId}\u0000${host.projectId}`;
      if (!hosts.has(hostKey)) hosts.set(hostKey, host);
    }
  }
  for (const row of rows) {
    for (const workspace of row.workspaces) {
      if (workspaces.has(workspace.workspaceKey)) continue;
      workspaces.set(workspace.workspaceKey, {
        ...workspace,
        projectViewKey: key,
        projectName: primary.projectName,
      });
    }
  }
  return {
    ...primary,
    viewKey: key,
    hosts: [...hosts.values()],
    workspaces: [...workspaces.values()],
  };
}
