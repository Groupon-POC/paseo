// Changed for Groupon Desk (fork of Paseo, Apache-2.0): From GitHub (Groupon's organisations and teams) as the first way, and the only GitHub one: Paseo's Clone from GitHub is off the menu; with no connected host it points at Your Macs, not Add host; the first page lists the person's Macs from the hub, this Mac first even while its hand is not running (greyed with the reason and the command), and the flow opens on this Mac, never on another merely because it is the only one serving; it is also From GitHub's host step (`add-to-mac-model.ts`); Search for directory, Choose parent directory and Choose destination browse the Mac's folders a click at a time (groupon/folder-browser.tsx); this Mac's row and the title carry the green "This computer" label.
import { usePanelStore } from "@/stores/panel-store";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { router } from "expo-router";
import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";
import {
  ArrowLeft,
  FolderOpen,
  FolderPlus,
  Laptop,
  Plus,
  Search,
  Server,
} from "lucide-react-native";
import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableStateCallbackType,
} from "react-native";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitHubIcon } from "@/components/icons/github-icon";
import { useGithubProjectStore } from "@/groupon/github-project-store";
import { ThisComputerBadge } from "@/groupon/this-computer-badge";
import { GROUPON_ADD_TO_MAC, GROUPON_GITHUB, GROUPON_YOUR_MACS } from "@/groupon/strings";
import {
  addToMacStart,
  firstSelectableRow,
  openAddToMacFlow,
  type AddToMacIntent,
  type AddToMacRow,
} from "@/groupon/add-to-mac-model";
import {
  AddToMacGithubHint,
  ThisMacHandReason,
  useAddToMacRows,
  useThisMacHandWatch,
} from "@/groupon/add-to-mac";
import { PASEO_MANUAL_HOSTS } from "@/groupon/pairing-policy";
import {
  backAddProjectPage,
  browseAddProjectFolder,
  isFolderBrowsePage,
  chooseAddProjectHost,
  currentAddProjectPage,
  moveAddProjectSelection,
  openDirectorySearchPage,
  openGithubLocationPage,
  openGithubSearchPage,
  openNewDirectoryNamePage,
  openNewDirectoryParentPage,
  setAddProjectActiveIndex,
  setAddProjectPageInput,
  setNewDirectoryName,
  toggleAddProjectHiddenFolders,
  updateCurrentAddProjectPage,
  type AddProjectFlowState,
  type AddProjectHost,
  type AddProjectPage,
  type GithubRepositoryChoice,
} from "@/add-project-flow/model";
import {
  buildAddProjectMethods,
  addProjectMethodEmptyText,
  buildManualGithubRepositoryChoices,
  joinDirectoryPath,
  pathBaseName,
  type AddProjectMethodId,
} from "@/add-project-flow/options";
import {
  FOLDER_BROWSER,
  FolderBreadcrumb,
  FolderBrowserActions,
  browserRowIcon,
  browserRowKey,
  browserRowSubtitle,
  browserRowTitle,
  useFolderBrowser,
} from "@/groupon/folder-browser";
import { displayPath, isTypedPath } from "@/groupon/folder-browser-model";
import { Shortcut } from "@/components/ui/shortcut";
import { useRevealActiveItem } from "@/components/ui/scroll-reveal";
import { useKeyboardShortcutsAvailable } from "@/keyboard/availability";
import { getIsElectronRuntime } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { pickDirectory } from "@/desktop/pick-directory";
import { useFetchQuery } from "@/data/query";
import { getOpenProjectFailureReason, registerProjectDescriptor } from "@/hooks/open-project";
import { useIsLocalDaemon, useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useCloneGithubProject, useOpenProject } from "@/hooks/use-open-project";
import {
  OverlayLayerProvider,
  useGlobalWebOverlayLayer,
  useWebOverlayRegistration,
} from "@/lib/overlay-root";
import {
  useHosts,
  useHostRuntimeClient,
  useHostRuntimeConnectionStatuses,
} from "@/runtime/host-runtime";
import { useHostFeatureMap } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import type { AddProjectFlowRequest } from "@/stores/add-project-flow-store";
import type { Theme } from "@/styles/theme";
import { shortenPath } from "@/utils/shorten-path";
import { buildNewWorkspaceRoute, buildSettingsAddHostRoute } from "@/utils/host-routes";

interface AddProjectFlowProps {
  request: AddProjectFlowRequest;
  onClose: () => void;
}

interface FlowRowOption {
  id: string;
  title: string;
  subtitle: string | null;
  /** Groupon Desk: the green "This computer" label after the title, on this Mac's row. */
  badge?: string | null;
  icon: ComponentType<{ size?: number; color?: string }>;
  disabled?: boolean;
  /** Groupon Desk: under this Mac's greyed row, why and the command that starts its hand. */
  reason?: { text: string; command: string };
  testID: string;
  select: () => void;
}

type GithubLocationPage = Extract<AddProjectPage, { kind: "github-location" }>;

interface FlowIconProps {
  icon: ComponentType<{ size?: number; color?: string }>;
  size?: number;
  color?: string;
}

function FlowIcon({ icon: Icon, size, color }: FlowIconProps) {
  return <Icon size={size} color={color} />;
}

const MutedFlowIcon = withUnistyles(FlowIcon, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedArrowLeft = withUnistyles(ArrowLeft);
const ThemedTextInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const EMPTY_PATHS: string[] = [];
const NAVIGATION_HINT_KEYS = ["Up", "Down"];
const CHOOSE_FOLDER_HINT_KEYS = ["mod", "Enter"];
const FOLDER_BROWSER_FOUND = "Found in the home folder";
const SELECT_HINT_KEYS = ["Enter"];
const ESCAPE_HINT_KEYS = ["Esc"];

function FlowBackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.backButton}
      accessibilityRole="button"
      accessibilityLabel="Back"
      testID="add-project-flow-back"
    >
      {({ hovered, pressed }) => (
        <ThemedArrowLeft
          size={18}
          uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
        />
      )}
    </Pressable>
  );
}

function methodIcon(method: AddProjectMethodId): FlowRowOption["icon"] {
  if (method === "github") return GitHubIcon;
  if (method === "browse") return FolderOpen;
  if (method === "new-directory") return FolderPlus;
  return Search;
}

function progressText(page: AddProjectPage): string {
  if (page.kind === "github-location") return "Cloning project...";
  if (page.kind === "new-directory-name") return "Creating directory...";
  return "Adding project...";
}

function emptyText(page: AddProjectPage, host: AddProjectHost | null): string {
  if (isFolderBrowsePage(page)) {
    return page.query.trim() ? FOLDER_BROWSER.noMatch : FOLDER_BROWSER.empty;
  }
  if (page.kind === "host") return GROUPON_ADD_TO_MAC.noMac;
  if (page.kind === "github-search") return "Enter a GitHub URL or owner/repo";
  if (page.kind === "method") return addProjectMethodEmptyText(host);
  return "No matching options";
}

interface QueryErrorInput {
  searchesDirectories: boolean;
  directoryFailed: boolean;
  githubFailed: boolean;
  githubAvailable: boolean | null;
  githubError: string | null;
}

function queryErrorText(input: QueryErrorInput): string | null {
  if (input.searchesDirectories && input.directoryFailed) return "Unable to search directories";
  if (input.githubFailed) return "Unable to search GitHub repositories";
  if (input.githubError) return input.githubError;
  if (input.githubAvailable === false) return input.githubError ?? "GitHub search is unavailable";
  return null;
}

/** Groupon Desk: the chosen Mac as the hub names it, the green "This computer" after this Mac's name. */
function macContext(
  macRows: readonly AddToMacRow[],
  host: AddProjectHost | null,
): { label: string; badge: string | null } {
  if (!host) return { label: "", badge: null };
  const mac = macRows.find((row) => row.serverId === host.serverId);
  if (!mac) return { label: host.label, badge: null };
  return { label: mac.label, badge: mac.badge };
}

function HostContextText({ context }: { context: { label: string; badge: string | null } }) {
  return (
    <Text style={styles.hostContext} numberOfLines={1}>
      {context.label}
      {context.badge ? (
        <>
          {" "}
          <ThisComputerBadge badge={context.badge} />
        </>
      ) : null}
    </Text>
  );
}

function pageHostId(page: AddProjectPage): string | null {
  return page.kind === "host" ? null : page.hostId;
}

function pageTitle(page: AddProjectPage, intent: AddToMacIntent): string {
  switch (page.kind) {
    case "host":
      // Groupon Desk: the list of the person's Macs, for Add project or as From GitHub's host step.
      return intent === "github" ? GROUPON_ADD_TO_MAC.githubTitle : GROUPON_ADD_TO_MAC.title;
    case "method":
      return "Add project";
    case "directory-search":
      return "Search for directory";
    case "github-search":
      return "Clone from GitHub";
    case "github-location":
      return "Choose destination";
    case "new-directory-parent":
      return "Choose parent directory";
    case "new-directory-name":
      return "Name directory";
  }
}

type AddProjectInputPage = Exclude<AddProjectPage, { kind: "method" }>;

function pagePlaceholder(page: AddProjectInputPage): string {
  switch (page.kind) {
    case "host":
      return GROUPON_ADD_TO_MAC.searchPlaceholder;
    case "directory-search":
      return "Search directories or enter a path...";
    case "github-search":
      return "Search or enter a GitHub repository...";
    case "github-location":
    case "new-directory-parent":
      return "Search parent directories or enter a path...";
    case "new-directory-name":
      return "Directory name";
  }
}

function pageInput(page: AddProjectInputPage): string {
  return page.kind === "new-directory-name" ? page.name : page.query;
}

function clonePreview(parent: string, nameWithOwner: string, homePath: string | null): string {
  const path = joinDirectoryPath(parent, pathBaseName(nameWithOwner));
  return homePath ? displayPath(path, homePath) : path;
}

function pathTestId(path: string): string {
  return `add-project-flow-path-${encodeURIComponent(path)}`;
}

function FlowRow({
  option,
  active,
  activeItemRef,
  onRowLayout,
}: {
  option: FlowRowOption;
  active: boolean;
  activeItemRef: RefObject<View | null>;
  onRowLayout: () => void;
}) {
  const accessibilityState = useMemo(
    () => ({ disabled: option.disabled === true, selected: active }),
    [active, option.disabled],
  );
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (active || hovered || pressed) && styles.rowActive,
      option.disabled && styles.disabled,
    ],
    [active, option.disabled],
  );
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={option.disabled}
      ref={active ? activeItemRef : undefined}
      onLayout={active ? onRowLayout : undefined}
      onPress={option.select}
      style={rowStyle}
      testID={option.testID}
    >
      <View style={styles.iconSlot}>
        <MutedFlowIcon icon={option.icon} size={16} />
      </View>
      <View style={styles.rowText}>
        {option.badge ? (
          <View style={styles.rowTitleLine}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {option.title}
            </Text>
            <ThisComputerBadge badge={option.badge} testID={`${option.testID}-this-computer`} />
          </View>
        ) : (
          <Text style={styles.rowTitle} numberOfLines={1}>
            {option.title}
          </Text>
        )}
        {option.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {option.subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
  if (!option.reason) return row;
  // Groupon Desk: the reason stays readable under the greyed row, and its Copy button pressable.
  return (
    <View>
      {row}
      <ThisMacHandReason
        reason={option.reason.text}
        command={option.reason.command}
        testID={`${option.testID}-reason`}
      />
    </View>
  );
}

function FlowHint({ keys, action }: { keys: string[]; action: string }) {
  const shortcutsAvailable = useKeyboardShortcutsAvailable();
  if (!shortcutsAvailable) return null;

  return (
    <View style={styles.footerHint}>
      <Shortcut keys={keys} textStyle={styles.footerKeyText} />
      <Text style={styles.footerAction}>{action}</Text>
    </View>
  );
}

function setPageStatus(
  state: AddProjectFlowState,
  kind: AddProjectPage["kind"],
  input: { isSubmitting?: boolean; error?: string | null },
): AddProjectFlowState {
  return updateCurrentAddProjectPage(state, (page) =>
    page.kind === kind ? { ...page, ...input } : page,
  );
}

// The product flow is intentionally one cohesive page-stack state machine.
// eslint-disable-next-line complexity
export function AddProjectFlow({ request, onClose }: AddProjectFlowProps) {
  const hosts = useHosts();
  const hostIds = useMemo(() => hosts.map((host) => host.serverId), [hosts]);
  const connectionStatuses = useHostRuntimeConnectionStatuses(hostIds);
  const projectAddByHost = useHostFeatureMap(hostIds, "projectAdd");
  // COMPAT(stableProjectIdentity): added in v0.1.109, remove gate after 2027-01-15.
  const stableProjectIdentityByHost = useHostFeatureMap(hostIds, "stableProjectIdentity");
  // COMPAT(projectGithubClone): added in v0.1.108, remove gate after 2027-01-15.
  const githubCloneByHost = useHostFeatureMap(hostIds, "projectGithubClone");
  // COMPAT(workspaceGithubRepositorySearch): added in v0.1.108, remove gate after 2027-01-15.
  const githubSearchByHost = useHostFeatureMap(hostIds, "workspaceGithubRepositorySearch");
  // COMPAT(projectCreateDirectory): added in v0.1.108, remove gate after 2027-01-15.
  const createDirectoryByHost = useHostFeatureMap(hostIds, "projectCreateDirectory");
  const localServerId = useLocalDaemonServerId();
  const availableHosts = useMemo<AddProjectHost[]>(
    () =>
      hosts.flatMap((host) => {
        if (connectionStatuses.get(host.serverId) !== "online") return [];
        const canAddProject =
          projectAddByHost.get(host.serverId) === true &&
          stableProjectIdentityByHost.get(host.serverId) === true;
        return [
          {
            serverId: host.serverId,
            label: host.label,
            canAddProject,
            canBrowse: canAddProject && getIsElectronRuntime() && localServerId === host.serverId,
            canCloneGithubRepositories: githubCloneByHost.get(host.serverId) === true,
            canSearchGithubRepositories: githubSearchByHost.get(host.serverId) === true,
            canCreateDirectory: createDirectoryByHost.get(host.serverId) === true,
          },
        ];
      }),
    [
      connectionStatuses,
      createDirectoryByHost,
      githubCloneByHost,
      githubSearchByHost,
      hosts,
      localServerId,
      projectAddByHost,
      stableProjectIdentityByHost,
    ],
  );
  // Groupon Desk: the person's Macs from the hub, this Mac first; the flow opens on this Mac (or
  // the Mac the caller named), with the list one Back away, and never on another Mac merely
  // because it is the only one serving.
  const intent: AddToMacIntent = request.intent ?? "project";
  const macRows = useAddToMacRows({ hosts, connectionStatuses, availableHosts });
  const [state, setState] = useState(() =>
    openAddToMacFlow(
      availableHosts,
      addToMacStart({
        rows: macRows,
        intent,
        ...(request.preferredHostId ? { preferredHostId: request.preferredHostId } : {}),
      }),
    ),
  );
  const page = currentAddProjectPage(state);
  const hostId = pageHostId(page);
  const host = hostId ? state.hosts.find((candidate) => candidate.serverId === hostId) : null;
  const client = useHostRuntimeClient(hostId ?? "");
  const isLocalDaemon = useIsLocalDaemon(hostId ?? "");
  const openProject = useOpenProject(hostId);
  const cloneGithubProject = useCloneGithubProject(hostId);
  const upsertProject = useCallback(
    (
      targetServerId: string,
      project: Parameters<ReturnType<typeof getHostRuntimeStore>["acceptProjectSnapshot"]>[1],
    ) => {
      getHostRuntimeStore().acceptProjectSnapshot(targetServerId, project);
    },
    [],
  );
  const setHasHydratedWorkspaces = useSessionStore((store) => store.setHasHydratedWorkspaces);
  const inputRef = useRef<EditingTextInputHandle>(null);
  const resultsRef = useRef<ScrollView>(null);
  const submissionInFlightRef = useRef(false);
  const browseInFlightRef = useRef(false);
  const query = page.kind === "new-directory-name" || page.kind === "method" ? "" : page.query;
  const pageInputValueRef = useRef(page.kind === "method" ? "" : pageInput(page));
  pageInputValueRef.current = page.kind === "method" ? "" : pageInput(page);
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  // Groupon Desk: a Mac that comes online enables its row in place; the flow does not jump to it.
  useEffect(() => {
    setState((current) => ({ ...current, hosts: availableHosts }));
  }, [availableHosts]);
  useThisMacHandWatch(macRows, page.kind === "host");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    inputRef.current?.replaceText(pageInputValueRef.current);
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [page.kind]);

  // Groupon Desk: the folder pages browse one folder of the Mac at a time; Search for directory
  // also searches the whole home folder for a word, listed under the browsed folder's rows.
  const browsing = isFolderBrowsePage(page);
  const folderView = useFolderBrowser({
    serverId: hostId ?? "",
    folder: browsing ? page.folder : "~",
    query: browsing ? page.query : "",
    showHidden: browsing && page.showHidden,
    enabled: browsing,
  });
  const searchesDirectories =
    page.kind === "directory-search" &&
    debouncedQuery.trim().length > 0 &&
    !isTypedPath(debouncedQuery);
  const directoryQuery = useFetchQuery({
    queryKey: ["add-project-flow-directories", hostId, debouncedQuery],
    queryFn: async () => {
      if (!client) return { query: debouncedQuery, paths: [] as string[] };
      const payload = await client.getDirectorySuggestions({
        query: debouncedQuery,
        includeDirectories: true,
        includeFiles: false,
        limit: 30,
      });
      return {
        query: debouncedQuery,
        paths:
          payload.entries?.flatMap((entry) => (entry.kind === "directory" ? [entry.path] : [])) ??
          [],
      };
    },
    enabled: Boolean(client && searchesDirectories),
    dataShape: "value",
    retry: false,
    staleTimeMs: 15_000,
  });
  const githubQuery = useFetchQuery({
    queryKey: ["add-project-flow-github", hostId, debouncedQuery],
    queryFn: async () => {
      if (!client) throw new Error("Host is unavailable");
      const payload = await client.searchGithubRepositories({ query: debouncedQuery, limit: 30 });
      return { query: debouncedQuery, payload };
    },
    enabled: Boolean(client && page.kind === "github-search" && host?.canSearchGithubRepositories),
    dataShape: "value",
    retry: false,
    staleTimeMs: 15_000,
  });

  const handleBack = useCallback(() => {
    setState((current) => {
      const previous = backAddProjectPage(current);
      if (previous) return previous;
      onClose();
      return current;
    });
  }, [onClose]);

  const openNewWorkspaceForProject = useCallback(
    (serverId: string, project: WorkspaceProjectDescriptorPayload) => {
      onClose();
      usePanelStore.getState().showMobileAgent();
      router.push(
        buildNewWorkspaceRoute({
          serverId,
          projectId: project.projectId,
          sourceDirectory: project.projectRootPath,
          displayName: project.projectDisplayName,
        }),
      );
    },
    [onClose],
  );

  const openAddedProject = useCallback(
    async (path: string, sourceKind: "directory-search" | "method") => {
      if (!hostId || submissionInFlightRef.current) return;
      submissionInFlightRef.current = true;
      setState((current) =>
        setPageStatus(current, sourceKind, { isSubmitting: true, error: null }),
      );
      try {
        const result = await openProject(path);
        if (result.ok) {
          openNewWorkspaceForProject(hostId, result.project);
          return;
        }
        const reason = getOpenProjectFailureReason(result);
        const message =
          reason === "directory_not_found" ? "Directory not found" : "Unable to add project";
        setState((current) =>
          setPageStatus(current, sourceKind, { isSubmitting: false, error: message }),
        );
      } catch {
        setState((current) =>
          setPageStatus(current, sourceKind, {
            isSubmitting: false,
            error: "Unable to add project",
          }),
        );
      } finally {
        submissionInFlightRef.current = false;
      }
    },
    [hostId, openNewWorkspaceForProject, openProject],
  );

  const browse = useCallback(async () => {
    if (!hostId || !isLocalDaemon || browseInFlightRef.current) return;
    browseInFlightRef.current = true;
    try {
      const path = await pickDirectory();
      if (path) await openAddedProject(path, "method");
    } catch {
      setState((current) =>
        setPageStatus(current, "method", { error: "Unable to browse for a directory" }),
      );
    } finally {
      browseInFlightRef.current = false;
    }
  }, [hostId, isLocalDaemon, openAddedProject]);

  const selectMethod = useCallback(
    (method: AddProjectMethodId) => {
      if (!hostId) return;
      if (method === "directory-search") {
        setState((current) => openDirectorySearchPage(current, hostId));
      } else if (method === "browse") {
        void browse();
      } else if (method === "github") {
        setState((current) => openGithubSearchPage(current, hostId));
      } else {
        setState((current) => openNewDirectoryParentPage(current, hostId));
      }
    },
    [browse, hostId],
  );

  // Going into a folder empties the field, which is uncontrolled, so it is emptied by hand.
  const browseInto = useCallback((path: string) => {
    inputRef.current?.replaceText("");
    setState((current) => browseAddProjectFolder(current, path));
  }, []);
  const directoryPaths = useMemo(
    () =>
      searchesDirectories && directoryQuery.data?.query === query
        ? directoryQuery.data.paths
        : EMPTY_PATHS,
    [directoryQuery.data, query, searchesDirectories],
  );
  const cloneRepository = useCallback(
    async (locationPage: GithubLocationPage, parentPath: string) => {
      if (submissionInFlightRef.current) return;
      submissionInFlightRef.current = true;
      setState((current) =>
        setPageStatus(current, "github-location", { isSubmitting: true, error: null }),
      );
      try {
        const result = await cloneGithubProject(
          locationPage.repository.cloneUrl,
          parentPath,
          locationPage.repository.cloneProtocol,
        );
        if (result.ok) {
          openNewWorkspaceForProject(locationPage.hostId, result.project);
          return;
        }
        setState((current) =>
          setPageStatus(current, "github-location", {
            isSubmitting: false,
            error: result.error ?? "Unable to clone repository",
          }),
        );
      } catch (error) {
        setState((current) =>
          setPageStatus(current, "github-location", {
            isSubmitting: false,
            error: error instanceof Error ? error.message : "Unable to clone repository",
          }),
        );
      } finally {
        submissionInFlightRef.current = false;
      }
    },
    [cloneGithubProject, openNewWorkspaceForProject],
  );
  const openGrouponGithub = useGithubProjectStore((store) => store.open);
  const rows = useMemo<FlowRowOption[]>(() => {
    if (page.kind === "host") {
      const needle = page.query.trim().toLowerCase();
      const choices = macRows
        .filter((mac) => !needle || mac.label.toLowerCase().includes(needle))
        .map<FlowRowOption>((mac) => {
          const option: FlowRowOption = {
            id: mac.id,
            title: mac.label,
            subtitle: mac.note,
            badge: mac.badge,
            icon: mac.isThisMac ? Laptop : Server,
            disabled: !mac.selectable,
            testID: `add-project-flow-host-${mac.id}`,
            select: () => {
              const serverId = mac.serverId;
              if (!serverId) return;
              if (intent === "github") {
                onClose();
                openGrouponGithub(serverId);
                return;
              }
              setState((current) => chooseAddProjectHost(current, serverId));
            },
          };
          if (mac.reason && mac.command) {
            option.reason = { text: mac.reason, command: mac.command };
          }
          return option;
        });
      if (macRows.length === 0) {
        choices.push({
          id: "add-host",
          // Groupon Desk: Your Macs, where a Mac's hand is started; no host is added by hand.
          title: PASEO_MANUAL_HOSTS ? "Add host" : GROUPON_YOUR_MACS.title,
          subtitle: PASEO_MANUAL_HOSTS ? "No connected hosts" : GROUPON_YOUR_MACS.noneConnected,
          icon: Plus,
          testID: "add-project-flow-add-host",
          select: () => {
            onClose();
            usePanelStore.getState().showMobileAgent();
            router.push(buildSettingsAddHostRoute(Date.now()));
          },
        });
      }
      return choices;
    }
    if (page.kind === "method") {
      if (!host) return [];
      const grouponGithub: FlowRowOption[] = host.canAddProject
        ? [
            {
              id: "groupon-github",
              title: GROUPON_GITHUB.title,
              subtitle: GROUPON_GITHUB.description,
              icon: GitHubIcon,
              testID: "add-project-flow-method-groupon-github",
              select: () => {
                onClose();
                openGrouponGithub(host.serverId);
              },
            },
          ]
        : [];
      // Groupon Desk: From GitHub above is the one GitHub way; Paseo's search-and-clone is not offered.
      const methods = buildAddProjectMethods(host)
        .filter((method) => method.id !== "github")
        .map((method) => ({
          id: method.id,
          title: method.label,
          subtitle: method.description,
          icon: methodIcon(method.id),
          disabled: method.disabled,
          testID: `add-project-flow-method-${method.id}`,
          select: () => selectMethod(method.id),
        }));
      return [...grouponGithub, ...methods];
    }
    if (isFolderBrowsePage(page)) {
      const folderRows = folderView.rows.map<FlowRowOption>((row) => ({
        id: browserRowKey(row),
        title: browserRowTitle(row),
        subtitle: browserRowSubtitle(row),
        icon: browserRowIcon(row),
        testID:
          row.kind === "hidden"
            ? "add-project-flow-hidden-folders"
            : pathTestId(row.kind === "place" ? row.path : row.entry.path),
        select: () =>
          row.kind === "hidden"
            ? setState(toggleAddProjectHiddenFolders)
            : browseInto(row.kind === "place" ? row.path : row.entry.path),
      }));
      const homePath = folderView.listing?.homePath ?? null;
      const shown = new Set(folderRows.map((row) => row.id));
      const elsewhere = directoryPaths.flatMap<FlowRowOption>((path) =>
        shown.has(`folder:${path}`)
          ? []
          : [
              {
                id: `elsewhere:${path}`,
                title: homePath ? displayPath(path, homePath) : shortenPath(path),
                subtitle: FOLDER_BROWSER_FOUND,
                icon: Search,
                testID: pathTestId(path),
                select: () => browseInto(path),
              },
            ],
      );
      return [...folderRows, ...elsewhere];
    }
    if (page.kind === "github-search") {
      const search = githubQuery.data?.query === page.query ? githubQuery.data.payload : null;
      const repositories = search?.repositories ?? [];
      const normalizedQuery = page.query.trim().toLowerCase();
      const hasExactSearchResult = repositories.some(
        (repository) =>
          repository.nameWithOwner.toLowerCase() === normalizedQuery ||
          repository.cloneUrl.toLowerCase() === normalizedQuery,
      );
      const manualRepositories = hasExactSearchResult
        ? []
        : buildManualGithubRepositoryChoices(page.query);
      const repositoryChoices: GithubRepositoryChoice[] = [...manualRepositories, ...repositories];
      return repositoryChoices.map((repository) => ({
        id: repository.id,
        title: repository.cloneProtocol
          ? `${repository.nameWithOwner} via ${repository.cloneProtocol.toUpperCase()}`
          : repository.nameWithOwner,
        subtitle: repository.description,
        icon: GitHubIcon,
        testID: `add-project-flow-repository-${repository.id}`,
        select: () =>
          setState((current) => openGithubLocationPage(current, page.hostId, repository)),
      }));
    }
    return [];
  }, [
    browseInto,
    directoryPaths,
    folderView.listing,
    folderView.rows,
    githubQuery.data,
    host,
    intent,
    macRows,
    onClose,
    openGrouponGithub,
    page,
    selectMethod,
  ]);

  // Groupon Desk: Choose this folder on a folder page does what picking a row did before.
  const chooseFolder = useCallback(
    (path: string) => {
      if (page.kind === "directory-search") {
        void openAddedProject(path, "directory-search");
      } else if (page.kind === "new-directory-parent") {
        setState((current) => openNewDirectoryNamePage(current, page.hostId, path));
      } else if (page.kind === "github-location") {
        void cloneRepository(page, path);
      }
    },
    [cloneRepository, openAddedProject, page],
  );
  const setFolderError = useCallback(
    (message: string) =>
      setState((current) =>
        updateCurrentAddProjectPage(current, (currentPage) =>
          isFolderBrowsePage(currentPage) ? { ...currentPage, error: message } : currentPage,
        ),
      ),
    [],
  );

  const clampedIndex = rows.length === 0 ? 0 : Math.min(page.activeIndex, rows.length - 1);
  // Groupon Desk: a greyed Mac is never the active row; Enter picks the first Mac that can be chosen.
  const activeIndex =
    page.kind === "host" && rows[clampedIndex]?.disabled === true
      ? firstSelectableRow(rows)
      : clampedIndex;
  const rowListKey = useMemo(() => rows.map((row) => row.id).join("\u0000"), [rows]);
  const { activeItemRef, contentRef, onItemLayout, onViewportLayout, onScroll } =
    useRevealActiveItem({
      activeIndex,
      listKey: rowListKey,
      scrollRef: resultsRef,
    });
  const createDirectory = useCallback(async () => {
    if (page.kind !== "new-directory-name" || !client) return;
    const name = page.name.trim();
    if (!name || name === "." || name === ".." || /[\\/]/.test(name)) {
      setState((current) =>
        setPageStatus(current, "new-directory-name", { error: "Enter a directory name" }),
      );
      return;
    }
    if (submissionInFlightRef.current) return;
    submissionInFlightRef.current = true;
    setState((current) =>
      setPageStatus(current, "new-directory-name", { isSubmitting: true, error: null }),
    );
    try {
      const payload = await client.createProjectDirectory({
        parentPath: page.parentPath,
        name,
      });
      if (payload.error || !payload.project) {
        setState((current) =>
          setPageStatus(current, "new-directory-name", {
            isSubmitting: false,
            error: payload.error ?? "Unable to create directory",
          }),
        );
        return;
      }
      registerProjectDescriptor({
        serverId: page.hostId,
        project: payload.project,
        upsertProject,
        setHasHydratedWorkspaces,
      });
      openNewWorkspaceForProject(page.hostId, payload.project);
    } catch {
      setState((current) =>
        setPageStatus(current, "new-directory-name", {
          isSubmitting: false,
          error: "Unable to create directory",
        }),
      );
    } finally {
      submissionInFlightRef.current = false;
    }
  }, [client, openNewWorkspaceForProject, page, setHasHydratedWorkspaces, upsertProject]);

  const submitActive = useCallback(() => {
    if (page.kind === "new-directory-name") {
      void createDirectory();
      return;
    }
    const option = rows[activeIndex];
    if (option && !option.disabled) option.select();
    else if (browsing && rows.length === 0) chooseFolder(folderView.chosenPath);
  }, [
    activeIndex,
    browsing,
    chooseFolder,
    createDirectory,
    folderView.chosenPath,
    page.kind,
    rows,
  ]);

  const handleKey = useCallback(
    (key: string, withModifier = false): boolean => {
      if (key === "Escape") {
        handleBack();
        return true;
      }
      // Groupon Desk: Cmd/Ctrl+Enter chooses the folder looked at; Backspace in an empty field goes up.
      if (key === "Enter" && withModifier && browsing) {
        chooseFolder(folderView.chosenPath);
        return true;
      }
      if (key === "Backspace" && browsing && query === "" && folderView.parentPath) {
        browseInto(folderView.parentPath);
        return true;
      }
      if (key === "Enter") {
        submitActive();
        return true;
      }
      if (key !== "ArrowDown" && key !== "ArrowUp") return false;
      const next = moveAddProjectSelection(
        activeIndex,
        rows.map((row) => row.disabled !== true),
        key === "ArrowDown" ? "next" : "previous",
      );
      setState((current) => setAddProjectActiveIndex(current, next));
      return true;
    },
    [
      activeIndex,
      browseInto,
      browsing,
      chooseFolder,
      folderView.chosenPath,
      folderView.parentPath,
      handleBack,
      query,
      rows,
      submitActive,
    ],
  );

  const modalLayer = useGlobalWebOverlayLayer("modal", isWeb);
  const handleWebOverlayKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!handleKey(event.key, event.metaKey || event.ctrlKey)) return false;
      event.preventDefault();
      return true;
    },
    [handleKey],
  );
  const setWebOverlayScope = useWebOverlayRegistration({
    active: isWeb,
    layer: modalLayer,
    onKeyDown: handleWebOverlayKeyDown,
  });

  const handleNativeKeyPress = useCallback(
    ({ nativeEvent: { key } }: { nativeEvent: { key: string } }) => {
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Escape") {
        handleKey(key);
      }
    },
    [handleKey],
  );

  const handleInputChange = useCallback((value: string) => {
    setState((current) =>
      currentAddProjectPage(current).kind === "new-directory-name"
        ? setNewDirectoryName(current, value)
        : setAddProjectPageInput(current, value),
    );
  }, []);
  const isSubmitting = "isSubmitting" in page && page.isSubmitting;
  const currentGithubSearch =
    page.kind === "github-search" && githubQuery.data?.query === page.query
      ? githubQuery.data.payload
      : null;
  const loading =
    (browsing && folderView.loading) ||
    (page.kind === "github-search" &&
      host?.canSearchGithubRepositories === true &&
      (query !== debouncedQuery || githubQuery.isFetching));
  const queryError =
    (browsing ? folderView.error : null) ??
    queryErrorText({
      searchesDirectories,
      directoryFailed: directoryQuery.isError,
      githubFailed: page.kind === "github-search" && githubQuery.isError,
      githubAvailable: currentGithubSearch?.available ?? null,
      githubError: currentGithubSearch?.error ?? null,
    });
  // Groupon Desk: the Mac named as the hub names it, "This Mac" beside this Mac's name.
  const hostContext = macContext(macRows, host ?? null);
  let preview: string | null = null;
  if (page.kind === "new-directory-name" && page.name.trim()) {
    preview = joinDirectoryPath(page.parentPath, page.name.trim());
  } else if (page.kind === "github-location") {
    const homePath = folderView.listing?.homePath ?? null;
    preview = `Clones to ${clonePreview(folderView.chosenPath, page.repository.nameWithOwner, homePath)}`;
  }

  const modal = (
    <Modal visible transparent animationType="fade" onRequestClose={isWeb ? undefined : handleBack}>
      <View style={styles.overlay} testID="add-project-flow">
        <Pressable style={styles.backdrop} onPress={onClose} testID="add-project-flow-backdrop" />
        <View
          ref={setWebOverlayScope}
          style={styles.panel}
          testID={`add-project-flow-page-${page.kind}`}
          accessibilityLabel={`Add project: ${page.kind}`}
        >
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {state.pages.length > 1 ? <FlowBackButton onPress={handleBack} /> : null}
              <View style={styles.titleGroup} testID="add-project-flow-title">
                <Text style={styles.title} numberOfLines={1}>
                  {pageTitle(page, intent)}
                </Text>
                {host ? <HostContextText context={hostContext} /> : null}
              </View>
            </View>
            {page.kind === "method" && isNative ? (
              // Native hardware-keyboard events need a focused responder even without a visible field.
              <TextInput
                ref={inputRef}
                onKeyPress={handleNativeKeyPress}
                onSubmitEditing={submitActive}
                showSoftInputOnFocus={false}
                caretHidden
                contextMenuHidden
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                pointerEvents="none"
                style={styles.keyboardCapture}
                testID="add-project-flow-keyboard-capture"
              />
            ) : null}
            {page.kind !== "method" ? (
              <ThemedTextInput
                ref={inputRef}
                initialValue={pageInput(page)}
                onChangeText={handleInputChange}
                onKeyPress={isWeb ? undefined : handleNativeKeyPress}
                onSubmitEditing={isWeb ? undefined : submitActive}
                placeholder={pagePlaceholder(page)}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isSubmitting}
                returnKeyType="go"
                testID="add-project-flow-input"
              />
            ) : null}
            {browsing && hostId ? (
              <>
                <FolderBreadcrumb crumbs={folderView.crumbs} onGo={browseInto} />
                <FolderBrowserActions
                  serverId={hostId}
                  chosenPath={folderView.chosenPath}
                  homePath={folderView.listing?.homePath ?? null}
                  disabled={isSubmitting}
                  onChoose={chooseFolder}
                  onFinderPath={browseInto}
                  onError={setFolderError}
                />
              </>
            ) : null}
          </View>
          <ScrollView
            ref={resultsRef}
            style={styles.results}
            keyboardShouldPersistTaps="always"
            onLayout={onViewportLayout}
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            testID="add-project-flow-results"
          >
            <View ref={contentRef} collapsable={false} style={styles.resultsContent}>
              {preview ? (
                <Text style={styles.preview} testID="add-project-flow-path-preview">
                  {shortenPath(preview)}
                </Text>
              ) : null}
              {isSubmitting ? (
                <Text style={styles.stateText} testID="add-project-flow-progress">
                  {progressText(page)}
                </Text>
              ) : null}
              {!isSubmitting && page.error ? (
                <Text style={styles.errorText} testID="add-project-flow-error">
                  {page.error}
                </Text>
              ) : null}
              {!isSubmitting && queryError ? (
                <Text style={styles.errorText} testID="add-project-flow-query-error">
                  {queryError}
                </Text>
              ) : null}
              {!isSubmitting && browsing && folderView.listing?.truncated ? (
                <Text style={styles.stateText}>{FOLDER_BROWSER.truncated}</Text>
              ) : null}
              {!isSubmitting && loading ? (
                <Text style={styles.stateText} testID="add-project-flow-loading">
                  Loading...
                </Text>
              ) : null}
              {!isSubmitting &&
              (!loading || page.kind === "github-search") &&
              (!queryError || page.kind === "github-search" || browsing)
                ? rows.map((option, index) => (
                    <FlowRow
                      key={option.id}
                      option={option}
                      activeItemRef={activeItemRef}
                      active={index === activeIndex}
                      onRowLayout={onItemLayout}
                    />
                  ))
                : null}
              {page.kind === "host" && intent === "github" && macRows.length > 0 ? (
                <AddToMacGithubHint />
              ) : null}
              {!isSubmitting &&
              !loading &&
              !queryError &&
              rows.length === 0 &&
              page.kind !== "new-directory-name" ? (
                <Text style={styles.stateText} testID="add-project-flow-empty">
                  {emptyText(page, host ?? null)}
                </Text>
              ) : null}
            </View>
          </ScrollView>
          <View style={styles.footer} testID="add-project-flow-footer">
            <FlowHint keys={NAVIGATION_HINT_KEYS} action="Navigate" />
            <FlowHint keys={SELECT_HINT_KEYS} action={browsing ? "Open" : "Select"} />
            {browsing ? (
              <FlowHint keys={CHOOSE_FOLDER_HINT_KEYS} action={FOLDER_BROWSER.choose} />
            ) : null}
            <FlowHint keys={ESCAPE_HINT_KEYS} action={state.pages.length > 1 ? "Back" : "Close"} />
          </View>
        </View>
      </View>
    </Modal>
  );

  return createElement(OverlayLayerProvider, { layer: isWeb ? modalLayer : 0 }, modal);
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    width: 640,
    maxWidth: "92%",
    maxHeight: "80%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  header: {
    flexShrink: 0,
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing[2],
  },
  titleRow: {
    minHeight: theme.iconSize.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  backButton: {
    width: 18,
    height: theme.iconSize.lg,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.spacing[2],
  },
  title: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  hostContext: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
  input: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  keyboardCapture: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
  },
  results: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  resultsContent: { paddingVertical: theme.spacing[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowActive: { backgroundColor: theme.colors.surface1 },
  disabled: { opacity: theme.opacity[50] },
  iconSlot: { width: 18, alignItems: "center" },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: theme.colors.foreground, fontSize: theme.fontSize.base },
  rowTitleLine: { flexDirection: "row", alignItems: "baseline", gap: theme.spacing[2] },
  rowSubtitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, marginTop: 2 },
  preview: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  stateText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
  },
  footer: {
    flexShrink: 0,
    flexDirection: "row",
    gap: theme.spacing[4],
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
  },
  footerKeyText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  footerAction: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
