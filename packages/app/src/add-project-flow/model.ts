// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the folder pages (Search for directory, Choose parent directory, Choose destination) browse one folder at a time, so each keeps the folder looked at and whether hidden folders show.
export interface AddProjectHost {
  serverId: string;
  label: string;
  canAddProject: boolean;
  canBrowse: boolean;
  canCloneGithubRepositories: boolean;
  canSearchGithubRepositories: boolean;
  canCreateDirectory: boolean;
}

export interface GithubRepositoryChoice {
  id: string;
  nameWithOwner: string;
  cloneUrl: string;
  cloneProtocol?: "https" | "ssh";
  description: string | null;
  updatedAt: string | null;
}

interface PageState {
  activeIndex: number;
  error: string | null;
}

interface SearchPageState extends PageState {
  query: string;
}

/** Groupon Desk: a page that browses the Mac's folders (`groupon/folder-browser-model.ts`). */
interface FolderBrowseState {
  /** The folder looked at: `~` at first, then a path the daemon answered. */
  folder: string;
  showHidden: boolean;
}

export const FOLDER_BROWSE_START = "~";

export type AddProjectPage =
  | ({ kind: "host" } & SearchPageState)
  | ({ kind: "method"; hostId: string; isSubmitting: boolean } & PageState)
  | ({
      kind: "directory-search";
      hostId: string;
      isSubmitting: boolean;
    } & SearchPageState &
      FolderBrowseState)
  | ({ kind: "github-search"; hostId: string } & SearchPageState)
  | ({
      kind: "github-location";
      hostId: string;
      repository: GithubRepositoryChoice;
      isSubmitting: boolean;
    } & SearchPageState &
      FolderBrowseState)
  | ({ kind: "new-directory-parent"; hostId: string } & SearchPageState & FolderBrowseState)
  | {
      kind: "new-directory-name";
      hostId: string;
      parentPath: string;
      name: string;
      activeIndex: number;
      error: string | null;
      isSubmitting: boolean;
    };

export interface AddProjectFlowState {
  hosts: AddProjectHost[];
  pages: AddProjectPage[];
  newDirectoryNameDrafts: Record<string, string>;
  githubLocationDrafts: Record<string, { query: string; activeIndex: number }>;
}

export interface OpenAddProjectFlowInput {
  hosts: AddProjectHost[];
  preferredHostId?: string;
}

type SearchPageKind = Extract<AddProjectPage, { query: string }>["kind"];

function searchPage<TKind extends SearchPageKind>(kind: TKind) {
  return { kind, query: "", activeIndex: 0, error: null } as const;
}

function methodPage(hostId: string): AddProjectPage {
  return { kind: "method", hostId, activeIndex: 0, error: null, isSubmitting: false };
}

export function openAddProjectFlow(input: OpenAddProjectFlowInput): AddProjectFlowState {
  const preferredHost = input.preferredHostId
    ? input.hosts.find((host) => host.serverId === input.preferredHostId)
    : null;
  const onlyHost = input.hosts.length === 1 ? input.hosts[0] : null;
  const initialHost = preferredHost ?? onlyHost;

  return {
    hosts: input.hosts,
    pages: initialHost ? [methodPage(initialHost.serverId)] : [searchPage("host")],
    newDirectoryNameDrafts: {},
    githubLocationDrafts: {},
  };
}

export function applyAvailableAddProjectHosts(
  state: AddProjectFlowState,
  hosts: AddProjectHost[],
  preferredHostId?: string,
): AddProjectFlowState {
  const current = currentAddProjectPage(state);
  if (state.pages.length !== 1 || current.kind !== "host") {
    return { ...state, hosts };
  }
  const preferredHost = preferredHostId
    ? hosts.find((host) => host.serverId === preferredHostId)
    : null;
  const onlyHost = hosts.length === 1 ? hosts[0] : null;
  const initialHost = preferredHost ?? onlyHost;
  return {
    ...state,
    hosts,
    pages: initialHost ? [methodPage(initialHost.serverId)] : state.pages,
  };
}

export function currentAddProjectPage(state: AddProjectFlowState): AddProjectPage {
  const page = state.pages[state.pages.length - 1];
  if (!page) {
    throw new Error("Add Project flow must always contain a page");
  }
  return page;
}

export function updateCurrentAddProjectPage(
  state: AddProjectFlowState,
  update: (page: AddProjectPage) => AddProjectPage,
): AddProjectFlowState {
  const index = state.pages.length - 1;
  return {
    ...state,
    pages: state.pages.map((page, pageIndex) => (pageIndex === index ? update(page) : page)),
  };
}

export function pushAddProjectPage(
  state: AddProjectFlowState,
  page: AddProjectPage,
): AddProjectFlowState {
  return { ...state, pages: [...state.pages, page] };
}

export function backAddProjectPage(state: AddProjectFlowState): AddProjectFlowState | null {
  if (state.pages.length === 1) {
    return null;
  }
  return { ...state, pages: state.pages.slice(0, -1) };
}

export function chooseAddProjectHost(
  state: AddProjectFlowState,
  hostId: string,
): AddProjectFlowState {
  return pushAddProjectPage(state, methodPage(hostId));
}

export function openDirectorySearchPage(
  state: AddProjectFlowState,
  hostId: string,
): AddProjectFlowState {
  return pushAddProjectPage(state, {
    ...searchPage("directory-search"),
    ...folderBrowseStart(),
    hostId,
    isSubmitting: false,
  });
}

export function openGithubSearchPage(
  state: AddProjectFlowState,
  hostId: string,
): AddProjectFlowState {
  return pushAddProjectPage(state, { ...searchPage("github-search"), hostId });
}

export function openGithubLocationPage(
  state: AddProjectFlowState,
  hostId: string,
  repository: GithubRepositoryChoice,
): AddProjectFlowState {
  const draft = state.githubLocationDrafts[githubLocationDraftKey(hostId, repository.id)];
  return pushAddProjectPage(state, {
    kind: "github-location",
    query: draft?.query ?? "",
    activeIndex: draft?.activeIndex ?? 0,
    error: null,
    ...folderBrowseStart(),
    hostId,
    repository,
    isSubmitting: false,
  });
}

export function openNewDirectoryParentPage(
  state: AddProjectFlowState,
  hostId: string,
): AddProjectFlowState {
  return pushAddProjectPage(state, {
    ...searchPage("new-directory-parent"),
    ...folderBrowseStart(),
    hostId,
  });
}

function folderBrowseStart(): FolderBrowseState {
  return { folder: FOLDER_BROWSE_START, showHidden: false };
}

type FolderBrowsePage = Extract<AddProjectPage, FolderBrowseState>;

export function isFolderBrowsePage(page: AddProjectPage): page is FolderBrowsePage {
  return (
    page.kind === "directory-search" ||
    page.kind === "github-location" ||
    page.kind === "new-directory-parent"
  );
}

/** Groupon Desk: go into `path` on a folder page; the field empties, the first row is active. */
export function browseAddProjectFolder(
  state: AddProjectFlowState,
  path: string,
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  if (!isFolderBrowsePage(page)) return state;
  const moved = updateCurrentAddProjectPage(state, (current) =>
    isFolderBrowsePage(current)
      ? { ...current, folder: path, query: "", activeIndex: 0, error: null }
      : current,
  );
  if (page.kind !== "github-location") return moved;
  const draftKey = githubLocationDraftKey(page.hostId, page.repository.id);
  return {
    ...moved,
    githubLocationDrafts: {
      ...moved.githubLocationDrafts,
      [draftKey]: { query: "", activeIndex: 0 },
    },
  };
}

/** Groupon Desk: fold or unfold the hidden folders on a folder page. */
export function toggleAddProjectHiddenFolders(state: AddProjectFlowState): AddProjectFlowState {
  return updateCurrentAddProjectPage(state, (current) =>
    isFolderBrowsePage(current) ? { ...current, showHidden: !current.showHidden } : current,
  );
}

export function openNewDirectoryNamePage(
  state: AddProjectFlowState,
  hostId: string,
  parentPath: string,
): AddProjectFlowState {
  const draftKey = newDirectoryDraftKey(hostId, parentPath);
  return pushAddProjectPage(state, {
    kind: "new-directory-name",
    hostId,
    parentPath,
    name: state.newDirectoryNameDrafts[draftKey] ?? "",
    activeIndex: 0,
    error: null,
    isSubmitting: false,
  });
}

export function setAddProjectPageInput(
  state: AddProjectFlowState,
  value: string,
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  const updated = updateCurrentAddProjectPage(state, (current) => {
    if (current.kind === "new-directory-name") {
      return { ...current, name: value, activeIndex: 0, error: null };
    }
    if (current.kind === "method") return current;
    return { ...current, query: value, activeIndex: 0, error: null };
  });
  if (page.kind !== "github-location") return updated;
  const draftKey = githubLocationDraftKey(page.hostId, page.repository.id);
  return {
    ...updated,
    githubLocationDrafts: {
      ...updated.githubLocationDrafts,
      [draftKey]: { query: value, activeIndex: 0 },
    },
  };
}

export function setNewDirectoryName(
  state: AddProjectFlowState,
  value: string,
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  if (page.kind !== "new-directory-name") return state;
  const draftKey = newDirectoryDraftKey(page.hostId, page.parentPath);
  const updated = setAddProjectPageInput(state, value);
  return {
    ...updated,
    newDirectoryNameDrafts: {
      ...updated.newDirectoryNameDrafts,
      [draftKey]: value,
    },
  };
}

function newDirectoryDraftKey(hostId: string, parentPath: string): string {
  return `${hostId}\u0000${parentPath}`;
}

function githubLocationDraftKey(hostId: string, repositoryId: string): string {
  return `${hostId}\u0000${repositoryId}`;
}

export function setAddProjectActiveIndex(
  state: AddProjectFlowState,
  activeIndex: number,
): AddProjectFlowState {
  const page = currentAddProjectPage(state);
  const updated = updateCurrentAddProjectPage(state, (current) => ({ ...current, activeIndex }));
  if (page.kind !== "github-location") return updated;
  const draftKey = githubLocationDraftKey(page.hostId, page.repository.id);
  return {
    ...updated,
    githubLocationDrafts: {
      ...updated.githubLocationDrafts,
      [draftKey]: { query: page.query, activeIndex },
    },
  };
}

export function moveAddProjectActiveIndex(
  activeIndex: number,
  optionCount: number,
  direction: "next" | "previous",
): number {
  if (optionCount === 0) return 0;
  const delta = direction === "next" ? 1 : -1;
  const next = activeIndex + delta;
  if (next < 0) return optionCount - 1;
  if (next >= optionCount) return 0;
  return next;
}

export function moveAddProjectSelection(
  activeIndex: number,
  selectable: readonly boolean[],
  direction: "next" | "previous",
): number {
  if (!selectable.some(Boolean)) return 0;
  let next = activeIndex;
  for (let count = 0; count < selectable.length; count += 1) {
    next = moveAddProjectActiveIndex(next, selectable.length, direction);
    if (selectable[next]) return next;
  }
  return activeIndex;
}
