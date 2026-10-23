// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's Repository field, one repository on every Mac.

/**
 * New workspace's Repository field: the repositories of all the person's Macs, each once, and the
 * Mac follows the repository chosen. The lists and the rules are `repository-picker-model.ts`;
 * this file reads the hub's checkouts, holds the person's choice, and keeps Paseo's own project
 * selection (what the page creates the workspace from) on that repository's project on the
 * chosen Mac.
 *
 * Responsibilities:
 * - `useHubCheckouts`: the hub's repositories and every Mac's checkouts, re-read every minute
 * - `useRepositoryChoice`: the chosen repository (the person's pick, else the preselected one,
 *   else the repository of Paseo's own pick); choosing one moves the page to the Mac that holds
 *   it; a checkout the hub reports on the chosen Mac that Paseo does not list yet is opened as a
 *   project there; a Mac without it offers the From GitHub clone, prefilled, and the same sheet's
 *   way to add the checkout already on that Mac wherever it lies ("It is already on <Mac>")
 * - `RepositoryOption` and `RepositoryNotice`: a row of the list, and the line under the fields
 *   when the chosen Mac lacks the repository (or is opening it)
 *
 * Constraints:
 * - The workspace is only ever created from Paseo's project on the chosen Mac: while that Mac
 *   lacks the repository, the page has no project (never another repository in its place)
 * - A checkout is opened as a project once per Mac and path, and only for a repository the person
 *   chose or the page preselected from where they are
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { useFetchQuery } from "@/data/query";
import { useOpenProject } from "@/hooks/use-open-project";
import { getHostProjectSourceDirectory, type HostProjectListItem } from "@/projects/host-projects";
import { useGithubProjectStore } from "./github-project-store";
import { fetchOverview, type HubCheckout, type HubRepository } from "./hub";
import type { MacPickerOption } from "./mac-picker-model";
import { useGrouponPreferences } from "./preferences";
import {
  checkoutOnServer,
  paseoPick,
  repositoryState,
  type RepositoryState,
  cloneTargetOf,
  defaultMacForRepository,
  entryOfProject,
  macRepositoryNote,
  repositoryDescription,
  repositoryEntries,
  shortPath,
  type RepositoryEntry,
} from "./repository-picker-model";
import { useGrouponStore } from "./session";
import { GROUPON_MAC_PICKER, GROUPON_REPOSITORY_PICKER } from "./strings";

const HUB_CHECKOUTS_REFRESH_MS = 60_000;
const NO_REPOSITORIES: HubRepository[] = [];
const NO_CHECKOUTS: HubCheckout[] = [];

/** The hub's repositories and checkouts; empty until the hub answers (or from an older hub). */
export function useHubCheckouts(): { repositories: HubRepository[]; checkouts: HubCheckout[] } {
  const ready = useGrouponStore((state) => state.status === "ready");
  const query = useFetchQuery({
    queryKey: ["groupon-hub-checkouts"],
    queryFn: async () => {
      const overview = await fetchOverview();
      return { repositories: overview.repositories, checkouts: overview.checkouts ?? [] };
    },
    enabled: ready,
    dataShape: "value",
    staleTimeMs: HUB_CHECKOUTS_REFRESH_MS,
    refetchInterval: HUB_CHECKOUTS_REFRESH_MS,
    retry: false,
  });
  return {
    repositories: query.data?.repositories ?? NO_REPOSITORIES,
    checkouts: query.data?.checkouts ?? NO_CHECKOUTS,
  };
}

/** Every repository on the person's Macs, once each, from Paseo's projects and the hub. */
export function useRepositoryEntries(input: {
  projects: readonly HostProjectListItem[];
  macOptions: readonly MacPickerOption[];
  hostLabel: (serverId: string) => string;
}): RepositoryEntry[] {
  const { repositories, checkouts } = useHubCheckouts();
  const { projects, macOptions, hostLabel } = input;
  return useMemo(
    () =>
      repositoryEntries({
        projects,
        hubRepositories: repositories,
        hubCheckouts: checkouts,
        macs: macOptions,
        hostLabel,
      }),
    [checkouts, hostLabel, macOptions, projects, repositories],
  );
}

export interface RepositoryChoiceInput {
  entries: readonly RepositoryEntry[];
  /** The repository the page opens on (`preselectedRepositoryId`). */
  preselectedId: string | null;
  macOptions: readonly MacPickerOption[];
  selectedServerId: string;
  /** Paseo's own project pick on the chosen Mac, and its selectable projects by option id. */
  paseoSelectedProject: HostProjectListItem | null;
  paseoProjectByOptionId: ReadonlyMap<string, HostProjectListItem>;
  selectPaseoProject: (optionId: string) => void;
  /** Paseo's host switch: the Mac the page moves to. */
  selectMac: (serverId: string) => void;
}

export interface RepositoryChoice {
  entry: RepositoryEntry | null;
  /** `entry`'s id, or "" with none. */
  entryId: string;
  /** Paseo's project to create the workspace from: on the chosen Mac, of the chosen repository. */
  selectedProject: HostProjectListItem | null;
  selectedSourceDirectory: string | null;
  state: RepositoryState;
  options: ComboboxOption[];
  entryById: ReadonlyMap<string, RepositoryEntry>;
  triggerLabel: string;
  /** The chosen Mac's name, as the Mac picker names it. */
  macLabel: string;
  /** The Mac picker's rows, each saying whether that Mac holds the chosen repository. */
  macOptions: readonly MacPickerOption[];
  choose: (id: string) => void;
  /** After the person picked a Mac: a Mac without the repository opens the clone right away. */
  macChosen: (serverId: string) => void;
  /** The From GitHub clone of the chosen repository onto the chosen Mac. */
  clone: () => void;
  /** The same sheet on its other way: pick the checkout already on the chosen Mac. */
  pickExisting: () => void;
}

function failureText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Opens the checkout the hub reports on this Mac as a project there, once per Mac and path;
 * answers why it failed (null while it runs or after it worked).
 */
function useOpenReportedCheckout(serverId: string, path: string | null): string | null {
  const openProject = useOpenProject(serverId);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());
  const key = path ? `${serverId}\u0000${path}` : null;
  useEffect(() => {
    if (!key || !path || tried.current.has(key)) return;
    tried.current.add(key);
    const fail = (reason: string) => setFailures((current) => ({ ...current, [key]: reason }));
    const open = async () => {
      try {
        const result = await openProject(path);
        if (!result.ok) fail(result.error ?? GROUPON_REPOSITORY_PICKER.refused);
      } catch (error) {
        fail(failureText(error));
      }
    };
    void open();
  }, [key, openProject, path]);
  return key ? (failures[key] ?? null) : null;
}

function useRepositoryActions(
  input: RepositoryChoiceInput,
  /** The repository the person chose or the page preselected; never Paseo's fallback pick. */
  entry: RepositoryEntry | null,
  setPickedId: (id: string) => void,
  entryById: ReadonlyMap<string, RepositoryEntry>,
) {
  const { macOptions, selectMac, selectedServerId } = input;
  const openClone = useGithubProjectStore((state) => state.open);
  const choose = useCallback(
    (id: string) => {
      const next = entryById.get(id);
      if (!next) return;
      setPickedId(id);
      if (checkoutOnServer(next, selectedServerId, macOptions)) return;
      const mac = defaultMacForRepository(next, macOptions);
      if (mac) selectMac(mac);
    },
    [entryById, macOptions, selectMac, selectedServerId, setPickedId],
  );
  const macChosen = useCallback(
    (serverId: string) => {
      const target = entry ? cloneTargetOf(entry) : null;
      if (!entry || !target || checkoutOnServer(entry, serverId, macOptions)) return;
      openClone(serverId, target);
    },
    [entry, macOptions, openClone],
  );
  const clone = useCallback(() => {
    const target = entry ? cloneTargetOf(entry) : null;
    if (target) openClone(selectedServerId, target);
  }, [entry, openClone, selectedServerId]);
  const pickExisting = useCallback(() => {
    const target = entry ? cloneTargetOf(entry) : null;
    if (target) openClone(selectedServerId, { ...target, mode: "existing" });
  }, [entry, openClone, selectedServerId]);
  return { choose, macChosen, clone, pickExisting };
}

export function useRepositoryChoice(input: RepositoryChoiceInput): RepositoryChoice {
  const { entries, preselectedId, macOptions, selectedServerId, selectPaseoProject } = input;
  const [pickedId, setPickedId] = useState<string | null>(null);
  const rememberRepository = useGrouponPreferences((state) => state.rememberRepository);

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const intended = entryById.get(pickedId ?? preselectedId ?? "") ?? null;
  const entry = intended ?? entryOfProject(entries, input.paseoSelectedProject);
  const checkout = entry ? checkoutOnServer(entry, selectedServerId, macOptions) : null;

  // Keep Paseo's pick on the repository's project on this Mac.
  const { selectedProject, wantedOptionId } = paseoPick({
    paseoSelectedProject: input.paseoSelectedProject,
    paseoProjectByOptionId: input.paseoProjectByOptionId,
    serverId: selectedServerId,
    checkout,
  });
  useEffect(() => {
    if (wantedOptionId) selectPaseoProject(wantedOptionId);
  }, [selectPaseoProject, wantedOptionId]);

  const chosenMac = macOptions.find(
    (mac) => mac.serverId === selectedServerId || mac.hostServerId === selectedServerId,
  );
  const onConnectedMac = chosenMac?.selectable === true;
  // A checkout the hub reports on this Mac that Paseo does not list yet: open it as a project.
  const reportedOnly =
    onConnectedMac && intended !== null && checkout !== null && checkout.projectId === null;
  const openFailure = useOpenReportedCheckout(
    selectedServerId,
    reportedOnly ? (checkout?.path ?? null) : null,
  );

  const entryId = entry?.id ?? "";
  useEffect(() => {
    if (entryId) rememberRepository(entryId);
  }, [entryId, rememberRepository]);

  const options = useMemo<ComboboxOption[]>(
    () =>
      entries.map((row) => ({
        id: row.id,
        label: row.label,
        description: repositoryDescription(row),
        searchText: `${row.remote ?? ""} ${row.project?.projectName ?? ""}`,
      })),
    [entries],
  );
  const annotatedMacOptions = useMemo(
    () => macOptions.map((mac) => ({ ...mac, note: macRepositoryNote(mac, entry) })),
    [entry, macOptions],
  );
  const actions = useRepositoryActions(input, intended, setPickedId, entryById);

  return {
    entry,
    entryId,
    selectedProject,
    selectedSourceDirectory: selectedProject
      ? getHostProjectSourceDirectory(selectedProject, selectedServerId)
      : null,
    state: repositoryState(entry, onConnectedMac, checkout, openFailure),
    options,
    entryById,
    triggerLabel: entry?.label ?? GROUPON_REPOSITORY_PICKER.choose,
    macLabel: chosenMac?.label ?? GROUPON_MAC_PICKER.unknownMac,
    macOptions: annotatedMacOptions,
    ...actions,
  };
}

/** A repository in the list: its name, and the Macs that hold it (a folder: its Mac and path). */
export function RepositoryOption({
  option,
  selected,
  active,
  onPress,
  leadingSlot,
  disabled,
}: {
  option: ComboboxOption;
  selected: boolean;
  active: boolean;
  onPress: () => void;
  leadingSlot?: ReactElement;
  disabled: boolean;
}): ReactElement {
  return (
    <ComboboxItem
      testID={`new-workspace-repository-option-${option.id}`}
      label={option.label}
      description={option.description}
      selected={selected}
      active={active}
      disabled={disabled}
      onPress={onPress}
      leadingSlot={leadingSlot}
    />
  );
}

/** The one line under the fields when the chosen Mac lacks the repository, or is opening it. */
export function RepositoryNotice({ choice }: { choice: RepositoryChoice }): ReactElement | null {
  const { entry, state, clone, pickExisting, macLabel } = choice;
  if (!entry || state.kind === "none" || state.kind === "ready") return null;
  let text: string;
  if (state.kind === "opening") {
    text = GROUPON_REPOSITORY_PICKER.adding(shortPath(state.checkout.path), macLabel);
  } else if (state.kind === "openFailed") {
    text = GROUPON_REPOSITORY_PICKER.addFailed(
      shortPath(state.checkout.path),
      macLabel,
      state.reason,
    );
  } else if (entry.remote === null) {
    text = GROUPON_REPOSITORY_PICKER.folderNotOn(entry.label, macLabel);
  } else {
    text = GROUPON_REPOSITORY_PICKER.notOn(entry.label, macLabel);
  }
  return (
    <View style={styles.notice} testID="new-workspace-repository-notice">
      <Text style={styles.noticeText}>{text}</Text>
      {state.kind === "missing" && state.cloneable ? (
        <>
          <Button
            variant="outline"
            size="sm"
            onPress={clone}
            testID="new-workspace-repository-clone"
          >
            {GROUPON_REPOSITORY_PICKER.cloneOn(macLabel)}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onPress={pickExisting}
            testID="new-workspace-repository-existing"
          >
            {GROUPON_REPOSITORY_PICKER.alreadyOn(macLabel)}
          </Button>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[3],
  },
  noticeText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    flexShrink: 1,
  },
}));
