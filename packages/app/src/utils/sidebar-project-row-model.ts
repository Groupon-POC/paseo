// Changed for Groupon Desk (fork of Paseo, Apache-2.0): buildSidebarProjectChildrenModel, the project's workspace rows and its always-visible "+ New workspace" row.
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { createProjectIconTarget, type ProjectIconTarget } from "@/projects/icon-target";

export interface SidebarProjectHostTarget {
  serverId: string;
  projectId: string;
  iconWorkingDir: string;
  customIconRevision?: string | null;
  iconRevision?: string;
}

export type SidebarProjectTrailingAction =
  | { kind: "new_workspace"; target: SidebarProjectHostTarget }
  | { kind: "none" };

export interface SidebarProjectSectionRowModel {
  kind: "project_section";
  chevron: "expand" | "collapse";
  trailingAction: SidebarProjectTrailingAction;
}

export type SidebarProjectRowModel = SidebarProjectSectionRowModel;

const EMPTY_MULTIPLICITY_MAP: ReadonlyMap<string, boolean> = new Map();
function hostTarget(input: {
  serverId: string;
  projectId: string;
  iconWorkingDir: string;
  customIconRevision?: string | null;
  iconRevision?: string;
}): SidebarProjectHostTarget | null {
  const iconWorkingDir = input.iconWorkingDir.trim();
  if (!input.serverId || !iconWorkingDir) {
    return null;
  }
  return {
    serverId: input.serverId,
    projectId: input.projectId,
    iconWorkingDir,
    customIconRevision: input.customIconRevision,
    iconRevision: input.iconRevision,
  };
}

export function resolveSidebarProjectIconTarget(
  project: SidebarProjectEntry,
): SidebarProjectHostTarget | null {
  for (const host of project.hosts) {
    const target = hostTarget(host);
    if (target) {
      return target;
    }
  }
  return null;
}

export type SidebarProjectIconTarget = ProjectIconTarget;

export function resolveSidebarProjectIconTargets(
  projects: readonly SidebarProjectEntry[],
): SidebarProjectIconTarget[] {
  return projects.flatMap((project) => {
    const target = resolveSidebarProjectIconTarget(project);
    const iconTarget = target
      ? createProjectIconTarget({ projectViewKey: project.viewKey, placement: target })
      : null;
    return iconTarget ? [iconTarget] : [];
  });
}

export function resolveSidebarProjectLocalPath(
  project: SidebarProjectEntry,
  localServerId: string | null,
): string {
  if (!localServerId) return "";
  return project.hosts.find((host) => host.serverId === localServerId)?.iconWorkingDir.trim() ?? "";
}

// A project can host a brand-new workspace on a host when that host can create a
// git worktree (git projects) OR the host supports running multiple independent
// workspaces per directory (`workspaceMultiplicity`), which is what lets non-git
// directories add a second workspace. Mirrors the gate used by the global "New
// workspace" affordances (use-global-new-workspace-action.ts and left-sidebar's
// SidebarNewWorkspaceHeaderRow): `canCreateWorktree || supportsMultiplicity`.
function resolveNewWorkspaceTarget(
  project: SidebarProjectEntry,
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>,
  preferredServerId: string | null | undefined,
): SidebarProjectHostTarget | null {
  let fallbackTarget: SidebarProjectHostTarget | null = null;
  for (const host of project.hosts) {
    if (
      host.worktreeSupport === "unsupported" &&
      !supportsMultiplicityByServerId.get(host.serverId)
    ) {
      continue;
    }
    const target = hostTarget(host);
    if (!target) continue;
    if (host.serverId === preferredServerId) return target;
    fallbackTarget ??= target;
  }
  return fallbackTarget;
}

function projectTrailingAction(
  project: SidebarProjectEntry,
  supportsMultiplicityByServerId: ReadonlyMap<string, boolean>,
  preferredServerId: string | null | undefined,
): SidebarProjectTrailingAction {
  const target = resolveNewWorkspaceTarget(
    project,
    supportsMultiplicityByServerId,
    preferredServerId,
  );
  return target ? { kind: "new_workspace", target } : { kind: "none" };
}

export interface SidebarProjectChildrenModel {
  /** The project's workspace rows (and the show-more toggle) are drawn. */
  showWorkspaces: boolean;
  /** The "+ New workspace" row is drawn: under the last workspace, or alone for a project with none. */
  newWorkspaceTarget: SidebarProjectHostTarget | null;
}

// Changed for Groupon Desk: the "+ New workspace" row is always under a project's last workspace
// (owner, 2026-10-21), not only for a project with no workspace; the same row and the same action.
export function buildSidebarProjectChildrenModel(input: {
  collapsed: boolean;
  workspaceCount: number;
  trailingAction: SidebarProjectTrailingAction;
}): SidebarProjectChildrenModel {
  if (input.collapsed) return { showWorkspaces: false, newWorkspaceTarget: null };
  return {
    showWorkspaces: input.workspaceCount > 0,
    newWorkspaceTarget:
      input.trailingAction.kind === "new_workspace" ? input.trailingAction.target : null,
  };
}

export function buildSidebarProjectRowModel(input: {
  project: SidebarProjectEntry;
  collapsed: boolean;
  preferredServerId?: string | null;
  supportsMultiplicityByServerId?: ReadonlyMap<string, boolean>;
}): SidebarProjectRowModel {
  return {
    kind: "project_section",
    chevron: input.collapsed ? "expand" : "collapse",
    trailingAction: projectTrailingAction(
      input.project,
      input.supportsMultiplicityByServerId ?? EMPTY_MULTIPLICITY_MAP,
      input.preferredServerId,
    ),
  };
}
