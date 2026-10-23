// Added for Groupon Desk (fork of Paseo, Apache-2.0): the folder browser a person clicks through, for the Mac being chosen.

/**
 * The pieces every folder pick shares (Choose parent directory, Search for directory, From
 * GitHub's clone destination): the listing of one folder asked of that Mac's daemon, the places
 * offered at its home folder, the breadcrumb, Choose this folder, and, in the Electron window for
 * this Mac only, Browse… (Finder), the native folder dialog. The rules are in
 * `folder-browser-model.ts`; the add-project palette draws the rows itself so its keyboard
 * navigation keeps working, From GitHub mounts `FolderBrowserPanel`.
 *
 * Constraints:
 * - The Finder button never shows on the web, on a phone or for another Mac: a native dialog
 *   would pick a folder on the wrong computer.
 * - New files never call `useUnistyles` (the fork's lint); styles go through `StyleSheet.create`.
 */

import {
  ChevronRight,
  Eye,
  EyeOff,
  Folder,
  FolderGit2,
  FolderOpen,
  Star,
} from "lucide-react-native";
import { type ComponentType, useCallback, useEffect, useMemo, useState } from "react";
import { type PressableStateCallbackType, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { getIsElectronRuntime } from "@/constants/layout";
import { useFetchQuery } from "@/data/query";
import { getDesktopHost } from "@/desktop/host";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import {
  useHostRuntimeClient,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import { useRecommendedProjectPaths } from "@/stores/session-store-hooks";
import type { Theme } from "@/styles/theme";
import { pluginProblemText } from "./desk-plugin-rpc";
import {
  absolutePath,
  breadcrumbs,
  browserPlaces,
  browserRows,
  browserTarget,
  displayPath,
  hiddenToggleLabel,
  readFolder,
  type BrowserRow,
  type BrowserTarget,
  type Crumb,
  type FolderListing,
} from "./folder-browser-model";
import { useHubMachinesStore } from "./hub-sync";
import { macPickerOptions } from "./mac-picker-model";
import { useHubCheckouts } from "./repository-picker";
import { normaliseRemote } from "./repository-picker-model";

export const FOLDER_BROWSER = {
  choose: "Choose this folder",
  finder: "Browse… (Finder)",
  place: "Place",
  checkout: "Git checkout",
  filterPlaceholder: "Filter folders or enter a path…",
  truncated: "Only the first 2,000 folders are listed: type to narrow them.",
  empty: "No folders here",
  noMatch: "No matching folders",
  finderFailed: "Finder could not open a folder dialog.",
  thisRepository: "This repository",
} as const;

const NO_PATHS: string[] = [];

interface BrowserIconProps {
  icon: ComponentType<{ size?: number; color?: string }>;
  size?: number;
  color?: string;
}

function BrowserIcon({ icon: Icon, size, color }: BrowserIconProps) {
  return <Icon size={size} color={color} />;
}

const MutedIcon = withUnistyles(BrowserIcon, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

/** The icon of a browser row in either surface. */
export function browserRowIcon(row: BrowserRow): BrowserIconProps["icon"] {
  if (row.kind === "place") return Star;
  if (row.kind === "hidden") return row.shown ? EyeOff : Eye;
  return row.entry.gitCheckout ? FolderGit2 : Folder;
}

export function browserRowTitle(row: BrowserRow): string {
  if (row.kind === "place") return row.label;
  if (row.kind === "hidden") return hiddenToggleLabel(row);
  return row.entry.name;
}

/** `markRemote`: the repository being looked for; a checkout of it says so instead of "Git checkout". */
export function browserRowSubtitle(row: BrowserRow, markRemote?: string | null): string | null {
  if (row.kind === "place") return FOLDER_BROWSER.place;
  if (row.kind !== "folder" || !row.entry.gitCheckout) return null;
  const remote = row.entry.remote ? normaliseRemote(row.entry.remote) : null;
  return markRemote && remote === markRemote
    ? FOLDER_BROWSER.thisRepository
    : FOLDER_BROWSER.checkout;
}

export function browserRowKey(row: BrowserRow): string {
  if (row.kind === "place") return `place:${row.path}`;
  if (row.kind === "hidden") return "hidden-toggle";
  return `folder:${row.entry.path}`;
}

/** The hub's knowledge of one Mac: whether it is the Mac this window runs on, and its records. */
function useHubMacOf(serverId: string): { isThisMac: boolean; machineIds: string[] } {
  const allHosts = useHosts();
  const serverIds = useMemo(() => allHosts.map((host) => host.serverId), [allHosts]);
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const hubMachines = useHubMachinesStore((state) => state.machines);
  return useMemo(() => {
    const options = macPickerOptions(hubMachines, (id) => statuses.get(id) === "online", allHosts);
    const mac = options.find((option) => option.hostServerId === serverId);
    return { isThisMac: mac?.isThisMac ?? false, machineIds: mac?.machineIds ?? NO_PATHS };
  }, [allHosts, hubMachines, serverId, statuses]);
}

/** The checkouts the window knows of on that Mac: its daemon's projects and the hub's checkouts. */
function useKnownCheckoutPaths(serverId: string, machineIds: readonly string[]): string[] {
  const projectPaths = useRecommendedProjectPaths(serverId);
  const { checkouts } = useHubCheckouts();
  return useMemo(
    () => [
      ...projectPaths,
      ...checkouts
        .filter((checkout) => machineIds.includes(checkout.machine))
        .map((checkout) => checkout.rootPath),
    ],
    [checkouts, machineIds, projectPaths],
  );
}

/** The native folder dialog, for this Mac in the Electron window only; null everywhere else. */
export function useFinderChooser(
  serverId: string,
): ((defaultPath: string | null) => Promise<string | null>) | null {
  const { isThisMac } = useHubMacOf(serverId);
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const open = getDesktopHost()?.dialog?.open;
  const available = getIsElectronRuntime() && (isThisMac || isLocalDaemon) && Boolean(open);
  return useMemo(() => {
    if (!available || !open) return null;
    return async (defaultPath) => {
      const selection = await open({
        directory: true,
        multiple: false,
        createDirectory: true,
        ...(defaultPath ? { defaultPath } : {}),
      });
      return typeof selection === "string" ? selection : null;
    };
  }, [available, open]);
}

export interface FolderBrowserView {
  target: BrowserTarget;
  listing: FolderListing | null;
  rows: BrowserRow[];
  crumbs: Crumb[];
  /** The folder above the one looked at, null at home. */
  parentPath: string | null;
  /** What Choose this folder picks, absolute once the Mac's home is known. */
  chosenPath: string;
  loading: boolean;
  error: string | null;
}

/** One folder of the Mac `serverId`, as the browser shows it. */
export function useFolderBrowser(input: {
  serverId: string;
  folder: string;
  query: string;
  showHidden: boolean;
  enabled?: boolean;
}): FolderBrowserView {
  const client = useHostRuntimeClient(input.serverId);
  const target = useMemo(
    () => browserTarget(input.folder, input.query),
    [input.folder, input.query],
  );
  const enabled = Boolean(client) && input.enabled !== false;
  const query = useFetchQuery({
    queryKey: ["groupon-folder-browser", input.serverId, target.listPath],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readFolder(client, target.listPath);
    },
    enabled,
    // The folder looked at before stays drawn while the next one loads.
    dataShape: "list",
    retry: false,
    staleTimeMs: 10_000,
  });
  const listing = query.data ?? null;
  const { machineIds } = useHubMacOf(input.serverId);
  const checkoutPaths = useKnownCheckoutPaths(input.serverId, machineIds);
  const places = useMemo(
    () =>
      listing
        ? browserPlaces({ homePath: listing.homePath, usual: listing.places, checkoutPaths })
        : NO_PATHS,
    [checkoutPaths, listing],
  );
  const rows = useMemo(
    () => browserRows({ listing, places, filter: target.filter, showHidden: input.showHidden }),
    [input.showHidden, listing, places, target.filter],
  );
  const crumbs = useMemo(
    () => (listing && !listing.error ? breadcrumbs(listing.path, listing.homePath) : []),
    [listing],
  );
  // `folder` is `~` or a path the daemon answered; a typed path is taken as typed.
  const chosenPath = listing
    ? absolutePath(target.chosenPath, listing.homePath)
    : target.chosenPath;
  return {
    target,
    listing,
    rows,
    crumbs,
    parentPath: listing && !listing.error ? listing.parentPath : null,
    chosenPath,
    loading: enabled && query.isLoading,
    error: query.error ? pluginProblemText(query.error) : (listing?.error ?? null),
  };
}

const ThemedChevron = withUnistyles(ChevronRight, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

function CrumbButton({
  crumb,
  index,
  last,
  onGo,
}: {
  crumb: Crumb;
  index: number;
  last: boolean;
  onGo: (path: string) => void;
}) {
  const press = useCallback(() => onGo(crumb.path), [crumb.path, onGo]);
  const label = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
      <Text
        numberOfLines={1}
        style={[styles.crumb, last && styles.crumbLast, hovered && !last && styles.crumbHover]}
      >
        {crumb.label}
      </Text>
    ),
    [crumb.label, last],
  );
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={`Go to ${crumb.label}`}
      disabled={last}
      onPress={press}
      hitSlop={4}
      testID={`folder-browser-crumb-${index}`}
    >
      {label}
    </PressHighlight>
  );
}

/** Home › Documents › GitHub; every crumb but the last goes there. */
export function FolderBreadcrumb({
  crumbs,
  onGo,
}: {
  crumbs: readonly Crumb[];
  onGo: (path: string) => void;
}) {
  if (crumbs.length === 0) return null;
  return (
    <View style={styles.crumbs} testID="folder-browser-breadcrumb">
      {crumbs.map((crumb, index) => (
        <View key={crumb.path} style={styles.crumbItem}>
          {index > 0 ? <ThemedChevron size={12} /> : null}
          <CrumbButton crumb={crumb} index={index} last={index === crumbs.length - 1} onGo={onGo} />
        </View>
      ))}
    </View>
  );
}

/** Choose this folder, and Browse… (Finder) where a native dialog picks on the right Mac. */
export function FolderBrowserActions({
  serverId,
  chosenPath,
  homePath,
  chooseLabel = FOLDER_BROWSER.choose,
  disabled,
  onChoose,
  onFinderPath,
  onError,
}: {
  serverId: string;
  chosenPath: string;
  homePath: string | null;
  chooseLabel?: string | null;
  disabled?: boolean;
  onChoose?: (path: string) => void;
  onFinderPath: (path: string) => void;
  onError?: (message: string) => void;
}) {
  const finder = useFinderChooser(serverId);
  const [opening, setOpening] = useState(false);
  const openFinder = useCallback(async () => {
    if (!finder || opening) return;
    setOpening(true);
    try {
      const picked = await finder(homePath ? absolutePath(chosenPath, homePath) : null);
      if (picked) onFinderPath(picked);
    } catch {
      onError?.(FOLDER_BROWSER.finderFailed);
    } finally {
      setOpening(false);
    }
  }, [chosenPath, finder, homePath, onError, onFinderPath, opening]);
  const choose = useCallback(() => onChoose?.(chosenPath), [chosenPath, onChoose]);
  if (!finder && (!chooseLabel || !onChoose)) return null;
  return (
    <View style={styles.actions}>
      <Text style={styles.chosen} numberOfLines={1} testID="folder-browser-chosen">
        {homePath ? displayPath(absolutePath(chosenPath, homePath), homePath) : chosenPath}
      </Text>
      {finder ? (
        <Button
          variant="ghost"
          size="sm"
          leftIcon={FolderOpen}
          onPress={openFinder}
          disabled={disabled || opening}
          testID="folder-browser-finder"
        >
          {FOLDER_BROWSER.finder}
        </Button>
      ) : null}
      {chooseLabel && onChoose ? (
        <Button
          variant="default"
          size="sm"
          onPress={choose}
          disabled={disabled}
          testID="folder-browser-choose"
        >
          {chooseLabel}
        </Button>
      ) : null}
    </View>
  );
}

function rowStyle({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.row, (hovered || pressed) && styles.rowActive];
}

function PanelRow({
  row,
  disabled,
  markRemote,
  onSelect,
}: {
  row: BrowserRow;
  disabled?: boolean;
  markRemote?: string | null;
  onSelect: (row: BrowserRow) => void;
}) {
  const press = useCallback(() => onSelect(row), [onSelect, row]);
  const subtitle = browserRowSubtitle(row, markRemote);
  return (
    <PressHighlight
      accessibilityRole="button"
      disabled={disabled}
      onPress={press}
      style={rowStyle}
      testID={`folder-browser-row-${browserRowKey(row)}`}
    >
      <MutedIcon icon={browserRowIcon(row)} size={16} />
      <Text style={styles.rowTitle} numberOfLines={1}>
        {browserRowTitle(row)}
      </Text>
      {subtitle ? (
        <Text style={styles.rowDetail} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </PressHighlight>
  );
}

/**
 * The browser on its own, for a sheet (From GitHub's destination): the field filters or takes a
 * path, the breadcrumb goes up, a click on a folder goes in, and the folder looked at is the
 * value (`onChange`), so the sheet's own button acts on it.
 */
export function FolderBrowserPanel({
  serverId,
  initialFolder,
  disabled,
  onChange,
  onLooked,
  markRemote,
}: {
  serverId: string;
  initialFolder: string;
  disabled?: boolean;
  onChange: (path: string) => void;
  /** The folder looked at, absolute, with the listing drawn (which may still be the folder before). */
  onLooked?: (looked: { chosenPath: string; listing: FolderListing | null }) => void;
  /** The repository being looked for: its checkouts are marked "This repository". */
  markRemote?: string | null;
}) {
  const [folder, setFolder] = useState(initialFolder);
  const [query, setQuery] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [showHidden, setShowHidden] = useState(false);
  const [finderError, setFinderError] = useState<string | null>(null);
  const view = useFolderBrowser({ serverId, folder, query, showHidden });
  const homePath = view.listing?.homePath ?? null;
  const { chosenPath, listing } = view;
  useEffect(() => {
    onLooked?.({ chosenPath, listing });
  }, [chosenPath, listing, onLooked]);

  const go = useCallback(
    (path: string) => {
      setFolder(path);
      setQuery("");
      setInputKey((key) => key + 1);
      setFinderError(null);
      onChange(path);
    },
    [onChange],
  );
  const changeQuery = useCallback(
    (value: string) => {
      setQuery(value);
      const target = browserTarget(folder, value);
      onChange(homePath ? absolutePath(target.chosenPath, homePath) : target.chosenPath);
    },
    [folder, homePath, onChange],
  );
  const select = useCallback(
    (row: BrowserRow) => {
      if (row.kind === "hidden") setShowHidden((shown) => !shown);
      else go(row.kind === "place" ? row.path : row.entry.path);
    },
    [go],
  );
  const filtering = view.target.filter.length > 0;

  return (
    <View style={styles.panel} testID="folder-browser">
      <EditingTextInput
        key={inputKey}
        initialValue=""
        onChangeText={changeQuery}
        placeholder={FOLDER_BROWSER.filterPlaceholder}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!disabled}
        style={styles.input}
        testID="folder-browser-input"
      />
      <FolderBreadcrumb crumbs={view.crumbs} onGo={go} />
      <ScrollView style={styles.list} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {view.loading ? <Text style={styles.muted}>Loading…</Text> : null}
        {view.error ? <Text style={styles.error}>{view.error}</Text> : null}
        {view.rows.map((row) => (
          <PanelRow
            key={browserRowKey(row)}
            row={row}
            disabled={disabled}
            markRemote={markRemote}
            onSelect={select}
          />
        ))}
        {!view.loading && !view.error && view.listing && view.rows.length === 0 ? (
          <Text style={styles.muted}>
            {filtering ? FOLDER_BROWSER.noMatch : FOLDER_BROWSER.empty}
          </Text>
        ) : null}
        {view.listing?.truncated ? (
          <Text style={styles.muted}>{FOLDER_BROWSER.truncated}</Text>
        ) : null}
      </ScrollView>
      {finderError ? <Text style={styles.error}>{finderError}</Text> : null}
      <FolderBrowserActions
        serverId={serverId}
        chosenPath={view.chosenPath}
        homePath={homePath}
        chooseLabel={null}
        disabled={disabled}
        onFinderPath={go}
        onError={setFinderError}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    gap: theme.spacing[2],
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  crumbs: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  crumbItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  crumb: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  crumbHover: {
    color: theme.colors.foreground,
    textDecorationLine: "underline",
  },
  crumbLast: {
    color: theme.colors.foreground,
    fontWeight: theme.fontWeight.medium,
  },
  list: {
    maxHeight: 280,
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowActive: {
    backgroundColor: theme.colors.surface1,
  },
  rowTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  rowDetail: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
  chosen: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingVertical: theme.spacing[2],
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
