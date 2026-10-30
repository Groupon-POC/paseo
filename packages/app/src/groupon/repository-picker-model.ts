// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's Repository field, one repository on every Mac; "No project" is never preselected on New workspace.

/**
 * What New workspace's Repository field lists and which Mac it starts on. A project is a
 * repository, the same one on every Mac (owner, 2026-10-20): each entry is one repository, keyed
 * by its remote (`host/owner/name`), shown once, with the Macs that hold a checkout of it, merged
 * from Paseo's projects on every connected Mac and the hub's checkouts, which every Mac's hand
 * reports whether or not the window reaches that Mac. A folder with no remote stays its own entry
 * under its Mac. Pure, so it is tested without React.
 *
 * Responsibilities:
 * - `repositoryEntries`: the list, each entry with its checkouts per Mac (path, Paseo's project id)
 * - `preselectedRepositoryId`: the repository of the route's project (the sidebar's group, the
 *   workspace the person is in), else of the last workspace, else the last repository chosen
 * - `defaultMacForRepository`: this Mac when it holds the repository, else the first Mac that does
 * - `macRepositoryNote`: per Mac, whether it holds the chosen repository (and where) or not
 * - `cloneTargetOf`: the GitHub host and `owner/name` a missing checkout is cloned from
 * - `repositoryState`, `paseoPick`: whether the chosen Mac is ready, opening the checkout, or
 *   lacks it; and Paseo's project pick that stands for the repository there
 *
 * Constraints:
 * - The identity is the remote as the hand normalises it (lowercase host, no scheme, no `.git`);
 *   Paseo's `projectKey` (`remote:<host>/<path>`) is read into the same form
 * - A Mac is matched by its daemon's server id (Paseo's projects) or its hub machine ids (the
 *   hub's checkouts), never by a label
 */

import { isChatsProject } from "./project-less-chats";
import { getHostProjectId, type HostProjectListItem } from "@/projects/host-project-model";
import type { HubCheckout, HubRepository } from "./hub";
import type { MacPickerOption } from "./mac-picker-model";
import { GROUPON_REPOSITORY_PICKER } from "./strings";

/** One Mac's checkout of a repository. */
export interface RepositoryCheckout {
  /** The Mac picker's option id; null for a host no hub Mac stands behind. */
  macId: string | null;
  /** The Mac's daemon; null for a Mac the window has no host for (its hand never registered one). */
  serverId: string | null;
  macLabel: string;
  path: string;
  /** Paseo's project id on that host; null while that daemon does not list the checkout as a project. */
  projectId: string | null;
}

export interface RepositoryEntry {
  /** `repo:<remote>` for a repository, `folder:<Paseo view key>` for a folder with no remote. */
  id: string;
  /** `owner/name` for a repository, the folder's project name otherwise. */
  label: string;
  /** `host/owner/name`; null for a folder with no remote. */
  remote: string | null;
  /** Paseo's project for it (on any Mac); null while only the hub knows it. */
  project: HostProjectListItem | null;
  checkouts: RepositoryCheckout[];
}

export interface RepositoryEntriesInput {
  /** Paseo's projects on every host, grouped across hosts by Paseo. */
  projects: readonly HostProjectListItem[];
  hubRepositories: readonly HubRepository[];
  hubCheckouts: readonly HubCheckout[];
  macs: readonly MacPickerOption[];
  /** A host's label, for a checkout on a host the Mac picker does not list. */
  hostLabel?: (serverId: string) => string;
}

const REMOTE_PREFIX = "remote:";

/** `github.com/Owner/Name.git/` and Paseo's `remote:github.com/owner/name` read as `github.com/owner/name`. */
export function normaliseRemote(remote: string): string | null {
  const bare = remote.trim().startsWith(REMOTE_PREFIX)
    ? remote.trim().slice(REMOTE_PREFIX.length)
    : remote.trim();
  // A project in a subfolder of a repository is that folder, not the repository.
  if (bare.length === 0 || bare.includes("#")) return null;
  const normalised = bare
    .toLowerCase()
    .replace(/\/+$/, "")
    .replace(/\.git$/, "");
  // `host/path`: a host with a dot (or `localhost`) before the first slash; a local path is none.
  const host = normalised.split("/")[0] ?? "";
  const isHost = host.includes(".") || host.startsWith("localhost");
  return isHost && normalised.length > host.length + 1 ? normalised : null;
}

/** The repository a Paseo project stands for; null for a folder with no remote. */
export function remoteOfProject(project: Pick<HostProjectListItem, "projectKey">): string | null {
  const key = project.projectKey;
  return key?.startsWith(REMOTE_PREFIX) ? normaliseRemote(key) : null;
}

const repositoryId = (remote: string): string => `repo:${remote}`;
const folderId = (project: HostProjectListItem): string => `folder:${project.viewKey}`;

/** `owner/name` of `host/owner/name`. */
function ownerAndName(remote: string): string {
  return remote.split("/").slice(1).join("/");
}

function macOfServer(macs: readonly MacPickerOption[], serverId: string) {
  return macs.find((mac) => mac.hostServerId === serverId) ?? null;
}

function macOfMachine(macs: readonly MacPickerOption[], machine: string) {
  return macs.find((mac) => mac.machineIds.includes(machine)) ?? null;
}

interface Draft {
  entry: RepositoryEntry;
  byMac: Map<string, RepositoryCheckout>;
}

function addCheckout(draft: Draft, checkout: RepositoryCheckout): void {
  const key = checkout.macId ?? `server:${checkout.serverId}`;
  const kept = draft.byMac.get(key);
  // One checkout per Mac: the one Paseo lists as a project wins, else the first reported.
  if (kept && (kept.projectId !== null || checkout.projectId === null)) return;
  draft.byMac.set(key, checkout);
}

function projectCheckouts(
  project: HostProjectListItem,
  macs: readonly MacPickerOption[],
  hostLabel: (serverId: string) => string,
): RepositoryCheckout[] {
  return project.hosts.map((host) => {
    const mac = macOfServer(macs, host.serverId);
    return {
      macId: mac?.id ?? null,
      serverId: host.serverId,
      macLabel: mac?.label ?? hostLabel(host.serverId),
      path: host.iconWorkingDir,
      projectId: host.projectId,
    };
  });
}

/** Every repository once, with its Macs; then every folder with no remote under its Mac; by name. */
export function repositoryEntries(input: RepositoryEntriesInput): RepositoryEntry[] {
  const hostLabel = input.hostLabel ?? ((serverId: string) => serverId);
  const repositories = new Map<string, Draft>();
  const folders: Draft[] = [];
  const draftFor = (remote: string, project: HostProjectListItem | null): Draft => {
    const kept = repositories.get(remote);
    if (kept) {
      kept.entry.project ??= project;
      return kept;
    }
    const draft: Draft = {
      entry: {
        id: repositoryId(remote),
        label: ownerAndName(remote),
        remote,
        project,
        checkouts: [],
      },
      byMac: new Map(),
    };
    repositories.set(remote, draft);
    return draft;
  };

  for (const project of input.projects) {
    const remote = remoteOfProject(project);
    const draft: Draft = remote
      ? draftFor(remote, project)
      : {
          entry: {
            id: folderId(project),
            label: project.projectName,
            remote: null,
            project,
            checkouts: [],
          },
          byMac: new Map(),
        };
    if (!remote) folders.push(draft);
    for (const checkout of projectCheckouts(project, input.macs, hostLabel)) {
      addCheckout(draft, checkout);
    }
  }

  const remoteOfRepository = new Map<string, string>();
  for (const repository of input.hubRepositories) {
    const remote = normaliseRemote(repository.remoteUrl);
    if (!remote || repository.hidden) continue;
    remoteOfRepository.set(repository.id, remote);
  }
  for (const checkout of input.hubCheckouts) {
    const remote = remoteOfRepository.get(checkout.repositoryId);
    if (!remote) continue;
    const mac = macOfMachine(input.macs, checkout.machine);
    // A Mac the hub no longer lists has nothing to start on.
    if (!mac) continue;
    addCheckout(draftFor(remote, null), {
      macId: mac.id,
      serverId: mac.hostServerId,
      macLabel: mac.label,
      path: checkout.rootPath,
      projectId: null,
    });
  }

  const byName = (a: RepositoryEntry, b: RepositoryEntry) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" }) ||
    a.id.localeCompare(b.id);
  const finish = (draft: Draft): RepositoryEntry => ({
    ...draft.entry,
    checkouts: orderCheckouts([...draft.byMac.values()], input.macs),
  });
  return [
    ...[...repositories.values()].map(finish).sort(byName),
    ...folders.map(finish).sort(byName),
  ];
}

/** In the Mac picker's order (this Mac first), a host the picker does not list last. */
function orderCheckouts(
  checkouts: RepositoryCheckout[],
  macs: readonly MacPickerOption[],
): RepositoryCheckout[] {
  const rank = (checkout: RepositoryCheckout) => {
    const at = macs.findIndex((mac) => mac.id === checkout.macId);
    return at < 0 ? macs.length : at;
  };
  return checkouts.sort((a, b) => rank(a) - rank(b));
}

/** The entry a Paseo project belongs to: its repository, or its own folder entry. */
export function entryOfProject(
  entries: readonly RepositoryEntry[],
  project: HostProjectListItem | null,
): RepositoryEntry | null {
  if (!project) return null;
  const remote = remoteOfProject(project);
  if (remote) return entries.find((entry) => entry.remote === remote) ?? null;
  return (
    entries.find((entry) => entry.id === folderId(project)) ??
    entries.find(
      (entry) =>
        entry.remote === null &&
        entry.checkouts.some((checkout) =>
          project.hosts.some(
            (host) => host.serverId === checkout.serverId && host.projectId === checkout.projectId,
          ),
        ),
    ) ??
    null
  );
}

/**
 * The repository New workspace opens on: the one of the route's project (New workspace pressed in
 * a group or inside a workspace), else of the last workspace the person was in, else the
 * repository chosen last time; null with none of these (nothing to guess from).
 */
/** The entry of Paseo's own pick when nothing else chose one; never New chat's "No project". */
export function keptEntry(
  entries: readonly RepositoryEntry[],
  project: HostProjectListItem | null,
): RepositoryEntry | null {
  const entry = entryOfProject(entries, project);
  return entry && !isChatsProject(entry.project) ? entry : null;
}

/** The repository New workspace remembers as the last one chosen; "" for New chat's "No project". */
export function rememberedEntryId(entry: RepositoryEntry | null): string {
  return entry && !isChatsProject(entry.project) ? entry.id : "";
}

export function preselectedRepositoryId(input: {
  entries: readonly RepositoryEntry[];
  routeProject: HostProjectListItem | null;
  lastActiveProject: HostProjectListItem | null;
  lastRepositoryId: string | null;
}): string | null {
  for (const project of [input.routeProject, input.lastActiveProject]) {
    // "No project" is New chat's: only a route that names it opens it.
    if (project !== input.routeProject && isChatsProject(project)) continue;
    const entry = entryOfProject(input.entries, project);
    if (entry) return entry.id;
  }
  const last = input.entries.find((entry) => entry.id === input.lastRepositoryId);
  return last && !isChatsProject(last.project) ? last.id : null;
}

/** The checkout of the repository on the Mac picker's option, if that Mac holds one. */
export function checkoutOnMac(
  entry: RepositoryEntry,
  mac: Pick<MacPickerOption, "id" | "hostServerId">,
): RepositoryCheckout | null {
  return (
    entry.checkouts.find(
      (checkout) =>
        (checkout.macId !== null && checkout.macId === mac.id) ||
        (checkout.serverId !== null && checkout.serverId === mac.hostServerId),
    ) ?? null
  );
}

/** The checkout of the repository on the host the page is on, if that Mac holds one. */
export function checkoutOnServer(
  entry: RepositoryEntry,
  serverId: string,
  macs: readonly MacPickerOption[],
): RepositoryCheckout | null {
  const mac = macs.find(
    (option) => option.hostServerId === serverId || option.serverId === serverId,
  );
  if (mac) return checkoutOnMac(entry, mac);
  return entry.checkouts.find((checkout) => checkout.serverId === serverId) ?? null;
}

/**
 * The Mac a repository starts on: this Mac when it holds the repository and can be chosen, else
 * the first Mac in the picker's order that holds it and can be chosen; null when no Mac that can
 * be chosen holds it (the page stays on its Mac and offers the clone).
 */
export function defaultMacForRepository(
  entry: RepositoryEntry,
  macs: readonly MacPickerOption[],
): string | null {
  const holding = macs.filter((mac) => mac.selectable && checkoutOnMac(entry, mac) !== null);
  const thisMac = holding.find((mac) => mac.isThisMac);
  return (thisMac ?? holding[0])?.serverId ?? null;
}

/** `/Users/<name>/...` as `~/...`: the same folder reads the same on every Mac. */
export function shortPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
}

/**
 * The second line of a Mac in the picker while a repository is chosen: why it cannot be chosen
 * (its hand), else where it holds the repository, else that it does not and can clone it.
 */
export function macRepositoryNote(
  mac: MacPickerOption,
  entry: RepositoryEntry | null,
): string | null {
  if (!entry || !mac.selectable) return mac.note;
  const checkout = checkoutOnMac(entry, mac);
  let where: string = GROUPON_REPOSITORY_PICKER.missing;
  if (checkout) where = GROUPON_REPOSITORY_PICKER.holds(shortPath(checkout.path));
  else if (cloneTargetOf(entry)) where = GROUPON_REPOSITORY_PICKER.missingCloneable;
  return where;
}

/** The repository row's second line: the Macs that hold it (a host other than github.com first). */
export function repositoryDescription(entry: RepositoryEntry): string {
  const macs = entry.checkouts.map((checkout) => checkout.macLabel);
  const where = macs.length > 0 ? macs.join(", ") : GROUPON_REPOSITORY_PICKER.onNoMac;
  if (entry.remote === null) {
    const first = entry.checkouts[0];
    return first ? `${first.macLabel} · ${shortPath(first.path)}` : where;
  }
  const host = entry.remote.split("/")[0];
  return host && host !== "github.com" ? `${host} · ${where}` : where;
}

/** The GitHub host and `owner/name` to clone a repository from; null for a folder or a deeper path. */
export function cloneTargetOf(
  entry: Pick<RepositoryEntry, "remote">,
): { host: string; fullName: string } | null {
  const parts = entry.remote?.split("/") ?? [];
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { host: parts[0], fullName: `${parts[1]}/${parts[2]}` };
}

/** What the line under the fields says about the chosen repository on the chosen Mac. */
export type RepositoryState =
  | { kind: "none" }
  | { kind: "ready" }
  | { kind: "opening"; checkout: RepositoryCheckout }
  | { kind: "openFailed"; checkout: RepositoryCheckout; reason: string }
  | { kind: "missing"; cloneable: boolean };

function projectOnServer(
  byOptionId: ReadonlyMap<string, HostProjectListItem>,
  serverId: string,
  projectId: string,
): string | null {
  for (const [optionId, project] of byOptionId) {
    if (getHostProjectId(project, serverId) === projectId) return optionId;
  }
  return null;
}

export function repositoryState(
  entry: RepositoryEntry | null,
  onConnectedMac: boolean,
  checkout: RepositoryCheckout | null,
  openFailure: string | null,
): RepositoryState {
  // No connected Mac chosen: the Mac picker says why; there is nothing to clone onto or open.
  if (!entry || !onConnectedMac) return { kind: "none" };
  if (!checkout) return { kind: "missing", cloneable: cloneTargetOf(entry) !== null };
  if (checkout.projectId !== null) return { kind: "ready" };
  return openFailure
    ? { kind: "openFailed", checkout, reason: openFailure }
    : { kind: "opening", checkout };
}

/**
 * Paseo's own pick against the chosen repository's checkout on this Mac: the pick when it is that
 * checkout's project, else no project and the option to pick (null while Paseo does not list it).
 */
export function paseoPick(input: {
  paseoSelectedProject: HostProjectListItem | null;
  paseoProjectByOptionId: ReadonlyMap<string, HostProjectListItem>;
  serverId: string;
  checkout: RepositoryCheckout | null;
}): { selectedProject: HostProjectListItem | null; wantedOptionId: string | null } {
  const { paseoSelectedProject, serverId } = input;
  const projectId = input.checkout?.projectId ?? null;
  if (projectId === null) return { selectedProject: null, wantedOptionId: null };
  if (paseoSelectedProject && getHostProjectId(paseoSelectedProject, serverId) === projectId) {
    return { selectedProject: paseoSelectedProject, wantedOptionId: null };
  }
  return {
    selectedProject: null,
    wantedOptionId: projectOnServer(input.paseoProjectByOptionId, serverId, projectId),
  };
}
