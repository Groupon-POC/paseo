// Changed for Groupon Desk (fork of Paseo, Apache-2.0): "On <Mac>", the hub Macs' picker, in place of Host, never Paseo's Host picker; Repository, each repository of all the person's Macs once, in place of Project, with the line under the fields when the chosen Mac lacks it; the "On <Mac>" field carries the green "This computer" label on this Mac.
import { useCallback, useMemo, type ReactElement, type ReactNode, type RefObject } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { TerminalProfile } from "@getpaseo/protocol/messages";
import { Combobox, type ComboboxOption, type ComboboxProps } from "@/components/ui/combobox";
import { HostStatusDot } from "@/components/host-status-dot";
import { MacPicker } from "@/groupon/mac-picker";
import {
  macPickerTriggerBadge,
  macPickerTriggerLabel,
  type MacPickerOption,
} from "@/groupon/mac-picker-model";
import { RepositoryOption } from "@/groupon/repository-picker";
import type { RepositoryEntry } from "@/groupon/repository-picker-model";
import { GROUPON_MAC_PICKER, GROUPON_REPOSITORY_PICKER } from "@/groupon/strings";
import type { LaunchTarget } from "@/new-workspace-launch/target";
import type { HostProjectListItem } from "@/projects/host-projects";
import type { HostProfile } from "@/types/host-connection";
import type { PickerItem } from "../../new-workspace-picker-item";
import {
  FIELD_BADGE_HEIGHT,
  FIELD_HEIGHT,
  FieldTrigger,
  type FieldTriggerVariant,
} from "./field-trigger";
import { branchIcon, folderIcon, ProjectIcon, pullRequestIcon } from "./icons";
import { LaunchControl } from "./launch-control";
import { AddProjectOption, IsolationOption, RefOption } from "./options";

type Isolation = "local" | "worktree";
type RenderOption = NonNullable<ComboboxProps["renderOption"]>;

interface PickerControl {
  anchorRef: RefObject<View | null>;
  open: () => void;
  openState: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface NewWorkspaceFormProps {
  isCompact: boolean;
  isPending: boolean;
  project: PickerControl & {
    /** Groupon Desk: one option per repository (`repository-picker-model.ts`). */
    options: ComboboxOption[];
    repositoryById: ReadonlyMap<string, RepositoryEntry>;
    iconDataByProjectViewKey: Map<string, string | null>;
    selectedProject: HostProjectListItem | null;
    selectedOptionId: string;
    triggerLabel: string;
    /** The line under the fields when the chosen Mac lacks the repository; null otherwise. */
    notice: ReactNode;
    selectedServerId: string;
    /** COMPAT(workspaceMultiplicity): without it only worktree-capable projects are selectable. */
    supportsWorkspaceMultiplicity: boolean;
    onSelect: (id: string) => void;
    onAddProject: () => void;
  };
  host: PickerControl & {
    allHosts: HostProfile[];
    selectedServerId: string;
    onSelect: (id: string) => void;
    onAddHost: () => void;
    /** Groupon Desk: the hub's Macs; when there are any, "On <Mac>" shows, even for one Mac. */
    macOptions: readonly MacPickerOption[];
  };
  isolation: PickerControl & {
    effectiveIsolation: Isolation;
    canCreateWorktree: boolean;
    onSelect: (isolation: Isolation) => void;
  };
  base: PickerControl & {
    selectedSourceDirectory: string | null;
    selectedItem: PickerItem | null;
    triggerLabel: string;
    options: ComboboxOption[];
    itemById: Map<string, PickerItem>;
    selectedOptionId: string;
    onSelect: (id: string) => void;
    setSearchQuery: (query: string) => void;
    emptyText: string;
    showRefPicker: boolean;
  };
  launch: {
    serverId: string;
    target: LaunchTarget;
    onChange: (target: LaunchTarget) => void;
    profiles: readonly TerminalProfile[];
    disabled: boolean;
  };
}

/** A repository can be chosen unless only a folder Paseo cannot make a worktree of stands for it. */
function isRepositorySelectable(
  entry: RepositoryEntry,
  supportsWorkspaceMultiplicity: boolean,
): boolean {
  return (
    supportsWorkspaceMultiplicity ||
    entry.remote !== null ||
    (entry.project?.hosts.some((host) => host.worktreeSupport !== "unsupported") ?? false)
  );
}

/** A repository row: Paseo's icon of its project (a folder while only the hub knows it). */
function RepositoryRow({
  entry,
  iconDataUri,
  ...row
}: Parameters<RenderOption>[0] & {
  entry: RepositoryEntry | undefined;
  iconDataUri: string | null;
  disabled: boolean;
}): ReactElement {
  const project = entry?.project ?? null;
  const leadingSlot = useMemo(
    () => (
      <View style={styles.iconBox}>
        {project ? (
          <ProjectIcon
            projectViewKey={project.viewKey}
            projectName={project.projectName}
            iconDataUri={iconDataUri}
          />
        ) : (
          folderIcon
        )}
      </View>
    ),
    [iconDataUri, project],
  );
  return <RepositoryOption {...row} leadingSlot={leadingSlot} />;
}

function useProjectPicker(
  project: NewWorkspaceFormProps["project"],
  isPending: boolean,
): { renderOption: RenderOption; footer: ReactNode } {
  const { repositoryById, iconDataByProjectViewKey } = project;
  const { supportsWorkspaceMultiplicity, onAddProject } = project;
  const renderOption = useCallback<RenderOption>(
    (row) => {
      const entry = repositoryById.get(row.option.id);
      const viewKey = entry?.project?.viewKey;
      return (
        <RepositoryRow
          {...row}
          entry={entry}
          iconDataUri={viewKey ? (iconDataByProjectViewKey.get(viewKey) ?? null) : null}
          disabled={
            isPending || !entry || !isRepositorySelectable(entry, supportsWorkspaceMultiplicity)
          }
        />
      );
    },
    [iconDataByProjectViewKey, isPending, repositoryById, supportsWorkspaceMultiplicity],
  );
  const footer = useMemo(() => <AddProjectOption onPress={onAddProject} />, [onAddProject]);
  return { renderOption, footer };
}

function useIsolationPicker(
  isolation: NewWorkspaceFormProps["isolation"],
  isPending: boolean,
): { options: ComboboxOption[]; onSelect: (id: string) => void; renderOption: RenderOption } {
  const { t } = useTranslation();
  const { canCreateWorktree, onSelect, onOpenChange } = isolation;
  // "New worktree" is omitted entirely (not disabled) when the project isn't a
  // git checkout, since worktree isolation is impossible there.
  const options = useMemo<ComboboxOption[]>(() => {
    const local = { id: "local", label: t("newWorkspace.isolation.local") };
    if (!canCreateWorktree) return [local];
    return [local, { id: "worktree", label: t("newWorkspace.isolation.worktree") }];
  }, [canCreateWorktree, t]);
  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id === "worktree" ? "worktree" : "local");
      onOpenChange(false);
    },
    [onOpenChange, onSelect],
  );
  const renderOption = useCallback<RenderOption>(
    (row) => <IsolationOption {...row} disabled={isPending} />,
    [isPending],
  );
  return { options, onSelect: handleSelect, renderOption };
}

function useRefRenderOption(itemById: Map<string, PickerItem>, isPending: boolean): RenderOption {
  return useCallback<RenderOption>(
    (row) => <RefOption {...row} item={itemById.get(row.option.id)} disabled={isPending} />,
    [isPending, itemById],
  );
}

/**
 * The host field: Groupon Desk's "On <Mac>", the person's Macs from the hub. Paseo's Host picker
 * is not shown: it names a host by the label Paseo's registry stored, so one Mac could appear twice.
 */
function HostField({
  host,
  variant,
  isPending,
}: {
  host: NewWorkspaceFormProps["host"];
  variant: FieldTriggerVariant;
  isPending: boolean;
}): ReactElement {
  const hostIcon = useMemo(
    () => <HostStatusDot serverId={host.selectedServerId} />,
    [host.selectedServerId],
  );
  return (
    <MacPicker
      options={host.macOptions}
      selectedServerId={host.selectedServerId}
      onSelect={host.onSelect}
      open={host.openState}
      onOpenChange={host.onOpenChange}
      anchorRef={host.anchorRef}
    >
      <FieldTrigger
        ref={host.anchorRef}
        variant={variant}
        label={GROUPON_MAC_PICKER.label}
        tooltip={GROUPON_MAC_PICKER.tooltip}
        icon={hostIcon}
        value={macPickerTriggerLabel(host.macOptions, host.selectedServerId)}
        badge={macPickerTriggerBadge(host.macOptions, host.selectedServerId)}
        onPress={host.open}
        disabled={isPending}
        testID="new-workspace-mac-picker-trigger"
      />
    </MacPicker>
  );
}

/**
 * The New workspace setup fields, one trigger per field, each opening its picker. Compact: a stack
 * of full-width fields with the label inside. Desktop: one meta row of badges. Either way, a field
 * that does not apply to the selected project is left out, and Host only shows with a second host.
 */
export function useNewWorkspaceForm(props: NewWorkspaceFormProps): ReactElement {
  const { t } = useTranslation();
  const { isCompact, isPending, project, host, isolation, base, launch } = props;
  const variant: FieldTriggerVariant = isCompact ? "field" : "badge";
  const projectPicker = useProjectPicker(project, isPending);
  const isolationPicker = useIsolationPicker(isolation, isPending);
  const renderRefOption = useRefRenderOption(base.itemById, isPending);

  // Groupon Desk: "On <Mac>" whenever there is a Mac to show, even one.
  const showHost = host.macOptions.length > 0;
  const selectedProject = project.selectedProject;
  const selectedProjectIconUri = selectedProject
    ? (project.iconDataByProjectViewKey.get(selectedProject.viewKey) ?? null)
    : null;
  const projectIcon = useMemo(
    () =>
      selectedProject ? (
        <ProjectIcon
          projectViewKey={selectedProject.viewKey}
          projectName={selectedProject.projectName}
          iconDataUri={selectedProjectIconUri}
        />
      ) : (
        folderIcon
      ),
    [selectedProject, selectedProjectIconUri],
  );
  const isWorktree = isolation.effectiveIsolation === "worktree";
  const isolationValue = isWorktree
    ? t("newWorkspace.isolation.worktree")
    : t("newWorkspace.isolation.local");
  const refIcon = base.selectedItem?.kind === "github-pr" ? pullRequestIcon : branchIcon;

  const projectField = (
    <FieldTrigger
      ref={project.anchorRef}
      variant={variant}
      label={GROUPON_REPOSITORY_PICKER.label}
      accessibilityLabel="Workspace repository"
      tooltip={GROUPON_REPOSITORY_PICKER.tooltip}
      icon={projectIcon}
      value={project.triggerLabel}
      onPress={project.open}
      disabled={isPending}
      testID="new-workspace-project-picker-trigger"
    />
  );
  const hostField = showHost ? (
    <HostField host={host} variant={variant} isPending={isPending} />
  ) : null;
  const isolationField = isolation.canCreateWorktree ? (
    <FieldTrigger
      ref={isolation.anchorRef}
      variant={variant}
      label={t("newWorkspace.isolation.label")}
      accessibilityLabel="Workspace isolation"
      tooltip={t("newWorkspace.tooltips.isolation")}
      icon={isWorktree ? branchIcon : folderIcon}
      value={isolationValue}
      onPress={isolation.open}
      disabled={isPending}
      testID="workspace-create-isolation-trigger"
    />
  ) : null;
  const baseField = base.showRefPicker ? (
    <FieldTrigger
      ref={base.anchorRef}
      variant={variant}
      label={t("newWorkspace.fields.branch")}
      accessibilityLabel={t("newWorkspace.refPicker.startingRef")}
      tooltip={t("newWorkspace.tooltips.startingRef")}
      icon={refIcon}
      value={base.triggerLabel}
      onPress={base.open}
      disabled={isPending || !base.selectedSourceDirectory}
      testID="new-workspace-ref-picker-trigger"
    />
  ) : null;
  const launchField = (
    <LaunchControl
      variant={variant}
      serverId={launch.serverId}
      target={launch.target}
      onChange={launch.onChange}
      profiles={launch.profiles}
      disabled={launch.disabled}
    />
  );

  const pickers = (
    <>
      <Combobox
        options={project.options}
        value={project.selectedOptionId}
        onSelect={project.onSelect}
        searchable
        searchPlaceholder={GROUPON_REPOSITORY_PICKER.searchPlaceholder}
        title={GROUPON_REPOSITORY_PICKER.title}
        open={project.openState}
        onOpenChange={project.onOpenChange}
        desktopPlacement="bottom-start"
        desktopMinWidth={360}
        anchorRef={project.anchorRef}
        emptyText={
          project.options.length === 0
            ? GROUPON_REPOSITORY_PICKER.empty
            : GROUPON_REPOSITORY_PICKER.noMatch
        }
        renderOption={projectPicker.renderOption}
        footer={projectPicker.footer}
      />
      <Combobox
        options={isolationPicker.options}
        value={isolation.effectiveIsolation}
        onSelect={isolationPicker.onSelect}
        title={t("newWorkspace.isolation.label")}
        open={isolation.openState}
        onOpenChange={isolation.onOpenChange}
        desktopPlacement="bottom-start"
        anchorRef={isolation.anchorRef}
        renderOption={isolationPicker.renderOption}
      />
      <Combobox
        options={base.options}
        value={base.selectedOptionId}
        onSelect={base.onSelect}
        searchable
        searchPlaceholder={t("newWorkspace.refPicker.searchPlaceholder")}
        title={t("newWorkspace.refPicker.title")}
        open={base.openState}
        onOpenChange={base.onOpenChange}
        onSearchQueryChange={base.setSearchQuery}
        desktopPlacement="bottom-start"
        anchorRef={base.anchorRef}
        emptyText={base.emptyText}
        renderOption={renderRefOption}
      />
    </>
  );

  if (isCompact) {
    return (
      <View testID="new-workspace-ref-picker-row" style={styles.compactStack}>
        {projectField}
        {hostField}
        {isolationField}
        {baseField}
        {launchField}
        {/* Isolation and Base come and go with the project; their rows stay reserved so the
            stack keeps one height and nothing above the composer jumps. */}
        {isolationField ? null : <View style={styles.reservedField} pointerEvents="none" />}
        {baseField ? null : <View style={styles.reservedField} pointerEvents="none" />}
        {project.notice}
        {pickers}
      </View>
    );
  }

  return (
    <>
      <View
        testID="new-workspace-ref-picker-row"
        style={styles.desktopRow}
        pointerEvents="box-none"
      >
        <View style={styles.desktopControl}>{projectField}</View>
        {hostField ? <View style={styles.desktopControl}>{hostField}</View> : null}
        {isolationField ? <View style={styles.desktopControl}>{isolationField}</View> : null}
        {baseField ? <View style={styles.desktopControl}>{baseField}</View> : null}
        <View style={styles.launchSpacer} pointerEvents="none" />
        {launchField}
        {pickers}
      </View>
      {project.notice}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  iconBox: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
  },
  compactStack: {
    marginBottom: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  reservedField: {
    height: FIELD_HEIGHT,
  },
  desktopRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: FIELD_BADGE_HEIGHT,
    // Matches the gap between the composer and the Import session pill below it.
    marginBottom: theme.spacing[4],
    // The badge adds its own left padding; offset it so the project icon's left
    // edge lands exactly on the "New workspace" title's left edge. The trailing
    // inset mirrors it so the launch chip stops on the composer's inner content
    // rather than running out to the composer's border.
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  desktopControl: {
    minWidth: 0,
    flexShrink: 1,
  },
  // Pushes the launch control to the trailing edge of the desktop meta row.
  launchSpacer: {
    flex: 1,
  },
}));
