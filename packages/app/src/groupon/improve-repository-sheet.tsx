// Added for Groupon Desk (fork of Paseo, Apache-2.0): Improve this repository, one prompt that tunes a repository for a newcomer.

/**
 * The sheet behind the home page's Improve this repository tile, the sidebar repository row's menu
 * entry and the Projects page's button: the repository (preselected from where it was opened, as
 * New workspace does), the Mac holding it (only a serving one can be chosen), a read-only preview
 * of what the agent will do, and Start. Start creates a workspace in a fresh worktree,
 * `improve-repository`, on that Mac and sends one prompt: the repository's own
 * `[prompts] improve_repository` from `.groupon/desk.toml` (read through the Groupon plugin's
 * `groupon.project-settings`), else the window's default (`GROUPON_IMPROVE.defaultPrompt`). The
 * workspace then shows as any other. The rules are `improve-repository-model.ts`.
 *
 * Constraints:
 * - Nothing starts on a Mac whose hand is not running (`MacPickerOption.selectable`), the guard of
 *   New workspace's Mac picker and Start a ticket
 * - The prompt sent is the one the preview shows, never a third text
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useFormPreferences } from "@/hooks/use-form-preferences";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import {
  hostProjectFromWorkspace,
  useHostProjects,
  type HostProjectListItem,
} from "@/projects/host-projects";
import {
  getHostRuntimeStore,
  useHostRuntimeClient,
  useHostRuntimeConnectionStatuses,
  useHosts,
} from "@/runtime/host-runtime";
import {
  navigateToWorkspace,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { generateDraftId } from "@/stores/draft-keys";
import { normalizeWorkspaceDescriptor } from "@/stores/session-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { pluginProblemText } from "./desk-plugin-rpc";
import { useHubMachinesStore } from "./hub-sync";
import {
  IMPROVE_WORKTREE_SLUG,
  improveWorkspaceRequest,
  improveAgent,
  improveChosenMac,
  improveMacProblem,
  improveMacServerId,
  improveMacs,
  improvePrompt,
  improveStartProblem,
  requestedRepositoryId,
  type ImproveMac,
  type ImprovePrompt,
  type ImproveRequestContext,
  type ImproveWorkspaceInput,
} from "./improve-repository-model";
import { useImproveRepositoryStore } from "./improve-repository-store";
import { macPickerOptions } from "./mac-picker-model";
import { useGrouponPreferences } from "./preferences";
import { useRepositoryEntries } from "./repository-picker";
import { repositoryDescription, shortPath, type RepositoryEntry } from "./repository-picker-model";
import { useRepositoryStandard } from "./repository-settings";
import { GROUPON_IMPROVE } from "./strings";

const SNAP_POINTS = ["80%", "94%"];
const SELECTED = { selected: true };
const UNSELECTED = { selected: false };

const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

/** Mounted once beside From GitHub; draws the sheet while a request is open. */
export function ImproveRepositorySheetHost() {
  const request = useImproveRepositoryStore((state) => state.request);
  const close = useImproveRepositoryStore((state) => state.close);
  if (!request) return null;
  return <ImproveRepositorySheet key={request.id} context={request.context} onClose={close} />;
}

/** The person's Macs as New workspace's Mac picker lists them (a stored host only in development). */
function useImproveMacOptions() {
  const allHosts = useHosts();
  const serverIds = useMemo(() => allHosts.map((host) => host.serverId), [allHosts]);
  const statuses = useHostRuntimeConnectionStatuses(serverIds);
  const hubMachines = useHubMachinesStore((state) => state.machines);
  const macOptions = useMemo(
    () => macPickerOptions(hubMachines, (id) => statuses.get(id) === "online", allHosts, __DEV__),
    [allHosts, hubMachines, statuses],
  );
  const hostLabel = useCallback(
    (id: string) => allHosts.find((host) => host.serverId === id)?.label ?? id,
    [allHosts],
  );
  return { serverIds, macOptions, hostLabel };
}

/** The project of the last workspace the person was in, as New workspace reads it. */
function useLastActiveProject(serverIds: readonly string[]): HostProjectListItem | null {
  const selection = useLastWorkspaceSelection();
  const serverId = selection && serverIds.includes(selection.serverId) ? selection.serverId : null;
  const workspace = useWorkspace(serverId, serverId ? selection!.workspaceId : null);
  return useMemo(
    () => (serverId ? hostProjectFromWorkspace({ serverId, workspace }) : null),
    [serverId, workspace],
  );
}

type Run = { status: "idle" } | { status: "running" } | { status: "failed"; error: string };

/** The repository (picked, else preselected from the context) and the Mac holding it that serves. */
function useImproveChoice(context: ImproveRequestContext) {
  const { serverIds, macOptions, hostLabel } = useImproveMacOptions();
  const projects = useHostProjects(serverIds);
  const entries = useRepositoryEntries({ projects, macOptions, hostLabel });
  const lastActiveProject = useLastActiveProject(serverIds);
  const lastRepositoryId = useGrouponPreferences((state) => state.lastRepositoryId ?? null);
  const [pickedRepositoryId, setPickedRepositoryId] = useState<string | null>(null);
  const [pickedServerId, setPickedServerId] = useState<string | null>(context.serverId ?? null);
  const preselected = requestedRepositoryId({
    entries,
    projects,
    context,
    lastActiveProject,
    lastRepositoryId,
  });
  const entry = entries.find((row) => row.id === (pickedRepositoryId ?? preselected)) ?? null;
  const holding = useMemo(() => improveMacs(entry, macOptions), [entry, macOptions]);
  const serverId = improveMacServerId(holding, pickedServerId);
  const chooseRepository = useCallback((id: string) => {
    setPickedRepositoryId(id);
    setPickedServerId(null);
  }, []);
  return {
    entries,
    entry,
    holding,
    serverId,
    macProblem: improveMacProblem(entry, holding),
    chosen: improveChosenMac(holding, serverId),
    chooseRepository,
    chooseMac: setPickedServerId,
  };
}

/** The prompt (the repository's own, read on the chosen Mac, else the default) and the agent. */
function useImprovePlan(serverId: string | null, checkoutPath: string) {
  const client = useHostRuntimeClient(serverId ?? "");
  const { answer, settled } = useRepositoryStandard(client, serverId ?? "", checkoutPath);
  const { entries: providers } = useProvidersSnapshot(serverId);
  const { preferences } = useFormPreferences();
  const unanswered = settled && !answer && checkoutPath.length > 0;
  return {
    client,
    prompt: improvePrompt(answer),
    promptNote: answer?.problem ?? (unanswered ? GROUPON_IMPROVE.noAnswer : null),
    promptReady: checkoutPath.length > 0 && settled,
    agent: improveAgent(providers, preferences),
  };
}

/** Start: the workspace in a fresh worktree with the prompt, then the window goes to it. */
function useImproveStart(onClose: () => void) {
  const [run, setRun] = useState<Run>({ status: "idle" });
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const start = useCallback(
    async (client: DaemonClient, serverId: string, request: ImproveWorkspaceInput) => {
      setRun({ status: "running" });
      try {
        const payload = await client.createWorkspace({
          idempotencyKey: generateDraftId(),
          ...improveWorkspaceRequest(request),
        });
        if (payload.error || !payload.workspace) {
          throw new Error(payload.error ?? GROUPON_IMPROVE.createFailed);
        }
        const workspace = normalizeWorkspaceDescriptor(payload.workspace);
        getHostRuntimeStore().acceptWorkspaceSnapshots(serverId, [
          { ...workspace, status: "running", statusEnteredAt: new Date() },
        ]);
        onClose();
        navigateToWorkspace({ serverId, workspaceId: workspace.id });
      } catch (error) {
        if (live.current) setRun({ status: "failed", error: pluginProblemText(error) });
      }
    },
    [onClose],
  );
  return { run, start };
}

function ImproveRepositorySheet({
  context,
  onClose,
}: {
  context: ImproveRequestContext;
  onClose: () => void;
}) {
  const choice = useImproveChoice(context);
  const { entry, serverId, chosen, macProblem } = choice;
  const plan = useImprovePlan(serverId, chosen?.checkout.path ?? "");
  const { client, prompt, agent } = plan;
  const { run, start } = useImproveStart(onClose);
  const running = run.status === "running";
  const problem = improveStartProblem({
    entry,
    macProblem,
    serverId,
    agent,
    promptReady: plan.promptReady,
  });

  const handleStart = useCallback(() => {
    if (!client || !serverId || !chosen || !agent || problem || running) return;
    void start(client, serverId, { checkout: chosen.checkout, agent, prompt: prompt.text });
  }, [agent, chosen, client, problem, prompt.text, running, serverId, start]);

  const header = useMemo<SheetHeader>(() => ({ title: GROUPON_IMPROVE.title }), []);
  const showHint = problem !== null && entry !== null && macProblem === null;

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-improve-repository-sheet"
      desktopMaxWidth={600}
      snapPoints={SNAP_POINTS}
    >
      <View style={styles.body}>
        <Text style={styles.muted}>{GROUPON_IMPROVE.intro}</Text>
        <RepositoryChoices
          entries={choice.entries}
          chosen={entry}
          onChoose={choice.chooseRepository}
        />
        {entry ? (
          <MacChoices holding={choice.holding} chosen={serverId} onChoose={choice.chooseMac} />
        ) : null}
        {macProblem && entry ? <Text style={styles.error}>{macProblem}</Text> : null}
        {chosen ? (
          <Preview
            mac={chosen}
            agentLine={agent ? GROUPON_IMPROVE.agent(agent.label, agent.modelLabel) : null}
            prompt={prompt}
            loading={!plan.promptReady}
            note={plan.promptNote}
          />
        ) : null}
        {run.status === "failed" ? <Text style={styles.error}>{run.error}</Text> : null}
        <View style={styles.actions}>
          {showHint ? <Text style={styles.hint}>{problem}</Text> : null}
          <Button
            variant="default"
            onPress={handleStart}
            loading={running}
            disabled={running || problem !== null}
            testID="groupon-improve-repository-start"
          >
            {running ? GROUPON_IMPROVE.starting : GROUPON_IMPROVE.start}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

function chipTextStyle(selected: boolean, disabled: boolean) {
  if (selected) return styles.chipTextSelected;
  return disabled ? styles.chipTextDisabled : styles.chipText;
}

function Chip({
  id,
  label,
  note,
  selected,
  disabled,
  onSelect,
  testID,
}: {
  id: string;
  label: string;
  note: string | null;
  selected: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
  testID: string;
}) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <PressHighlight
      style={selected ? styles.chipSelected : styles.chip}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={selected ? SELECTED : UNSELECTED}
      testID={testID}
    >
      <Text style={chipTextStyle(selected, disabled)} numberOfLines={1}>
        {label}
      </Text>
      {note ? (
        <Text style={styles.chipNote} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
    </PressHighlight>
  );
}

function RepositoryChoices({
  entries,
  chosen,
  onChoose,
}: {
  entries: readonly RepositoryEntry[];
  chosen: RepositoryEntry | null;
  onChoose: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{GROUPON_IMPROVE.repositoryLabel}</Text>
      {entries.length === 0 ? (
        <Text style={styles.muted}>{GROUPON_IMPROVE.noRepository}</Text>
      ) : null}
      <View style={styles.chips}>
        {entries.map((row) => (
          <Chip
            key={row.id}
            id={row.id}
            label={row.label}
            note={row.id === chosen?.id ? repositoryDescription(row) : null}
            selected={row.id === chosen?.id}
            disabled={false}
            onSelect={onChoose}
            testID={`groupon-improve-repository-${row.label}`}
          />
        ))}
      </View>
    </View>
  );
}

function MacChoices({
  holding,
  chosen,
  onChoose,
}: {
  holding: readonly ImproveMac[];
  chosen: string | null;
  onChoose: (serverId: string) => void;
}) {
  if (holding.length === 0) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{GROUPON_IMPROVE.macLabel}</Text>
      <View style={styles.chips}>
        {holding.map(({ mac, checkout }) => (
          <Chip
            key={mac.id}
            id={mac.serverId ?? mac.id}
            label={mac.label}
            note={mac.selectable ? shortPath(checkout.path) : mac.note}
            selected={mac.serverId !== null && mac.serverId === chosen}
            disabled={!mac.selectable || mac.serverId === null}
            onSelect={onChoose}
            testID={`groupon-improve-mac-${mac.id}`}
          />
        ))}
      </View>
    </View>
  );
}

function Preview({
  mac,
  agentLine,
  prompt,
  loading,
  note,
}: {
  mac: ImproveMac;
  agentLine: string | null;
  prompt: ImprovePrompt;
  loading: boolean;
  note: string | null;
}) {
  const [full, setFull] = useState(false);
  const toggle = useCallback(() => setFull((value) => !value), []);
  return (
    <View style={styles.field} testID="groupon-improve-preview">
      <Text style={styles.label}>{GROUPON_IMPROVE.previewLabel}</Text>
      <View style={styles.preview}>
        <Text style={styles.previewText}>
          {GROUPON_IMPROVE.where(IMPROVE_WORKTREE_SLUG, mac.mac.label)}
        </Text>
        {agentLine ? <Text style={styles.previewText}>{agentLine}</Text> : null}
        {loading ? (
          <View style={styles.status}>
            <ThemedSpinner size={14} />
            <Text style={styles.muted}>{GROUPON_IMPROVE.readingPrompt}</Text>
          </View>
        ) : (
          <PromptPreview prompt={prompt} note={note} full={full} />
        )}
      </View>
      {loading ? null : (
        <View style={styles.linkRow}>
          <Button variant="ghost" size="sm" onPress={toggle} testID="groupon-improve-full-prompt">
            {full ? GROUPON_IMPROVE.hideFullPrompt : GROUPON_IMPROVE.showFullPrompt}
          </Button>
        </View>
      )}
    </View>
  );
}

function promptCaption(prompt: ImprovePrompt, note: string | null): string {
  if (prompt.source === "repository") return GROUPON_IMPROVE.promptFromRepository;
  return note ? GROUPON_IMPROVE.promptUnread(note) : GROUPON_IMPROVE.promptDefault;
}

function PromptBody({ prompt, full }: { prompt: ImprovePrompt; full: boolean }) {
  if (full) {
    return (
      <Text style={styles.promptText} selectable testID="groupon-improve-prompt">
        {prompt.text}
      </Text>
    );
  }
  if (prompt.source === "repository") {
    return (
      <Text style={styles.promptText} numberOfLines={6} selectable>
        {prompt.text}
      </Text>
    );
  }
  return (
    <>
      {GROUPON_IMPROVE.steps.map((step, index) => (
        <Text key={step} style={styles.previewText}>
          {index + 1}. {step}
        </Text>
      ))}
    </>
  );
}

function PromptPreview({
  prompt,
  note,
  full,
}: {
  prompt: ImprovePrompt;
  note: string | null;
  full: boolean;
}) {
  return (
    <>
      <Text style={styles.muted}>{promptCaption(prompt, note)}</Text>
      <PromptBody prompt={prompt} full={full} />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[4],
  },
  field: {
    gap: theme.spacing[2],
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  chip: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chipTextSelected: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  chipTextDisabled: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    opacity: 0.6,
  },
  chipNote: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  preview: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  previewText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  promptText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  hint: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  linkRow: {
    flexDirection: "row",
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[3],
  },
}));
