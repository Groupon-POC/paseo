// Added for Groupon Desk (fork of Paseo, Apache-2.0): Start a ticket, the Dark Factory in the window.

/**
 * The New workspace page's third way in: a Jira key or link, the repository, the agent, model and
 * effort, then Start. The Groupon plugin on the chosen Mac runs what `groupon ticket start` runs,
 * without a terminal: the branch name and the readiness grading (the CLI itself, so its comment on
 * the ticket and its desk record are the CLI's), then Paseo's worktree on that branch and the
 * agent with the CLI's flow order. A ticket the readiness check hands back shows its questions and
 * the link, and nothing is created. My tasks' "Take to development" opens it with the key filled in.
 * While it runs, each step is marked as the hand reports it, with the time it has taken; a failure
 * shows the hand's sentence, and after five minutes of nothing the sheet stops waiting and says on
 * which step; both offer Retry (WW-83).
 */

import { router } from "expo-router";
import { Check, Circle, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { useProvidersSnapshot } from "@/hooks/use-providers-snapshot";
import { useHostProjects } from "@/projects/host-projects";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import { openExternalUrl } from "@/utils/open-external-url";
import { followJob, pluginProblemText, startTicketJob } from "./desk-plugin-rpc";
import {
  agentChoices,
  defaultEffortId,
  defaultModelId,
  effortOptions,
  elapsedText,
  normalizeTicketKey,
  repositoryChoices,
  runAfterClock,
  runAfterError,
  runAfterJob,
  runStarted,
  selectableModels,
  startProblem,
  stepRows,
  type Choice,
  type StepState,
  type TicketRun,
} from "./start-ticket-model";
import { useHubMachinesStore } from "./hub-sync";
import { thisComputerBadgeForHost } from "./mac-picker-model";
import { SheetSubtitle } from "./sheet-subtitle";
import { GROUPON_TICKET } from "./strings";

const SNAP_POINTS = ["80%", "94%"];

const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedCheck = withUnistyles(Check);
const ThemedCircle = withUnistyles(Circle);
const ThemedX = withUnistyles(X);
const accentMapping = (theme: Theme) => ({ color: theme.colors.accent });
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveMapping = (theme: Theme) => ({ color: theme.colors.destructive });

/** How often the elapsed time and the five-minute limit are looked at while the hand works. */
const CLOCK_MS = 1000;

/** What the New workspace page has chosen already; Start a ticket begins from it. */
export interface StartTicketInitial {
  serverId: string;
  projectViewKey: string | null;
  provider: string | null;
  model: string | null;
  effort: string | null;
  modeId: string | null;
  /** The key to start with: My tasks' row the person took; empty when opened from the button. */
  ticket?: string;
}

/** What the New workspace page's composer has chosen, read loosely: its state type is the page's own. */
export interface PageComposerChoice {
  selectedProvider?: string | null;
  effectiveModelId?: string | null;
  effectiveThinkingOptionId?: string | null;
  effectiveModeId?: string | null;
}

/** Start a ticket begins from the page's host, project, agent, model and effort. */
export function useStartTicketFromPage(input: {
  serverId: string;
  project: { viewKey: string } | null | undefined;
  composer: PageComposerChoice | null | undefined;
}): ReturnType<typeof useStartTicket> {
  const { serverId, composer } = input;
  const projectViewKey = input.project?.viewKey ?? null;
  const provider = composer?.selectedProvider ?? null;
  const model = composer?.effectiveModelId || null;
  const effort = composer?.effectiveThinkingOptionId || null;
  const modeId = composer?.effectiveModeId || null;
  const initial = useMemo<StartTicketInitial>(
    () => ({ serverId, projectViewKey, provider, model, effort, modeId }),
    [effort, modeId, model, projectViewKey, provider, serverId],
  );
  return useStartTicket(initial);
}

/**
 * The page's button and sheet: `open` shows the sheet for the page's current choices, `openFor`
 * the same with a ticket's key filled in (My tasks' Take to development).
 */
export function useStartTicket(initial: StartTicketInitial): {
  open: () => void;
  openFor: (ticket: string) => void;
  sheet: React.ReactElement | null;
} {
  const [opened, setOpened] = useState<StartTicketInitial | null>(null);
  const open = useCallback(() => setOpened(initial), [initial]);
  const openFor = useCallback((ticket: string) => setOpened({ ...initial, ticket }), [initial]);
  const close = useCallback(() => setOpened(null), []);
  const sheet = opened ? <StartTicketSheet initial={opened} onClose={close} /> : null;
  return { open, openFor, sheet };
}

function Chip({
  choice,
  selected,
  onSelect,
  testID,
}: {
  choice: Choice;
  selected: boolean;
  onSelect: (id: string) => void;
  testID: string;
}) {
  const handlePress = useCallback(() => onSelect(choice.id), [choice.id, onSelect]);
  return (
    <PressHighlight
      style={selected ? styles.chipSelected : styles.chip}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityState={selected ? SELECTED : UNSELECTED}
      testID={testID}
    >
      <Text style={selected ? styles.chipTextSelected : styles.chipText} numberOfLines={1}>
        {choice.label}
      </Text>
    </PressHighlight>
  );
}

const SELECTED = { selected: true };
const UNSELECTED = { selected: false };

function Choices({
  label,
  choices,
  selected,
  onSelect,
  empty,
  testIDPrefix,
}: {
  label: string;
  choices: Choice[];
  selected: string | null;
  onSelect: (id: string) => void;
  empty: string;
  testIDPrefix: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {choices.length === 0 ? <Text style={styles.muted}>{empty}</Text> : null}
      <View style={styles.chips}>
        {choices.map((choice) => (
          <Chip
            key={choice.id}
            choice={choice}
            selected={choice.id === selected}
            onSelect={onSelect}
            testID={`${testIDPrefix}-${choice.id}`}
          />
        ))}
      </View>
    </View>
  );
}

function StartTicketSheet({
  initial,
  onClose,
}: {
  initial: StartTicketInitial;
  onClose: () => void;
}) {
  const { serverId } = initial;
  const client = useHostRuntimeClient(serverId);
  const hostLabel = useHosts().find((host) => host.serverId === serverId)?.label ?? serverId;
  const hubViews = useHubMachinesStore((state) => state.machines);
  const hostBadge = thisComputerBadgeForHost(hubViews, serverId);
  const serverIds = useMemo(() => [serverId], [serverId]);
  const projects = useHostProjects(serverIds);
  const repositories = useMemo(() => repositoryChoices(projects, serverId), [projects, serverId]);
  const { entries } = useProvidersSnapshot(serverId);
  const agents = useMemo(() => agentChoices(entries), [entries]);

  const [ticket, setTicket] = useState(initial.ticket ?? "");
  const [repositoryKey, setRepositoryKey] = useState<string | null>(initial.projectViewKey);
  const [provider, setProvider] = useState<string | null>(initial.provider);
  const [model, setModel] = useState<string | null>(initial.model);
  const [effort, setEffort] = useState<string | null>(initial.effort);
  const [run, setRun] = useState<TicketRun>({ status: "idle" });
  const [now, setNow] = useState(() => Date.now());
  const live = useRef(true);
  // The attempt whose answers still count: a new Start, a Retry or the give-up moves it on.
  const attempt = useRef(0);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const running = run.status === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const next = runAfterClock(run, now, hostLabel);
    if (next === run) return;
    attempt.current += 1;
    setRun(next);
  }, [hostLabel, now, run]);

  const repository = repositories.find((row) => row.key === repositoryKey) ?? null;
  const shownProvider = agents.some((agent) => agent.id === provider)
    ? provider
    : (agents[0]?.id ?? null);
  const entry = entries?.find((row) => row.provider === shownProvider);
  const shownModel = defaultModelId(entry, model);
  const modelDefinition = selectableModels(entry).find((row) => row.id === shownModel);
  const shownEffort = defaultEffortId(modelDefinition, effort);
  const models = useMemo<Choice[]>(
    () => selectableModels(entry).map((row) => ({ id: row.id, label: row.label })),
    [entry],
  );
  const efforts = useMemo<Choice[]>(
    () => effortOptions(modelDefinition).map((row) => ({ id: row.id, label: row.label })),
    [modelDefinition],
  );
  const repositoryRows = useMemo<Choice[]>(
    () => repositories.map((row) => ({ id: row.key, label: row.label })),
    [repositories],
  );

  const problem = startProblem({ ticket, repository, provider: shownProvider, model: shownModel });

  const start = useCallback(async () => {
    if (!client || running || problem || !repository || !shownProvider || !shownModel) return;
    const key = normalizeTicketKey(ticket) ?? ticket;
    attempt.current += 1;
    const mine = attempt.current;
    const startedAt = Date.now();
    setNow(startedAt);
    setRun(runStarted(key, mine, startedAt));
    const counts = () => live.current && attempt.current === mine;
    try {
      const jobId = await startTicketJob(client, {
        ticket: key,
        projectRoot: repository.projectRoot,
        ...(repository.projectId ? { projectId: repository.projectId } : {}),
        provider: shownProvider,
        model: shownModel,
        ...(shownEffort ? { thinkingOptionId: shownEffort } : {}),
        ...(initial.modeId && shownProvider === initial.provider ? { modeId: initial.modeId } : {}),
      });
      const job = await followJob(
        client,
        jobId,
        (next) => setRun((current) => runAfterJob(current, mine, next)),
        counts,
      );
      if (!job || !counts()) return;
      if (job.status === "done" && job.ticket?.kind === "started") {
        onClose();
        router.push(buildHostWorkspaceRoute(serverId, job.ticket.workspaceId));
      }
    } catch (error) {
      if (counts()) setRun((current) => runAfterError(current, mine, pluginProblemText(error)));
    }
  }, [
    client,
    initial.modeId,
    initial.provider,
    onClose,
    problem,
    repository,
    running,
    serverId,
    shownEffort,
    shownModel,
    shownProvider,
    ticket,
  ]);

  const handleStart = useCallback(() => void start(), [start]);
  const handleProvider = useCallback((id: string) => {
    setProvider(id);
    setModel(null);
    setEffort(null);
  }, []);
  const handleModel = useCallback((id: string) => {
    setModel(id);
    setEffort(null);
  }, []);

  const header = useMemo<SheetHeader>(
    () => ({
      title: GROUPON_TICKET.title,
      subtitle: <SheetSubtitle text={`${GROUPON_TICKET.on} ${hostLabel}`} badge={hostBadge} />,
    }),
    [hostBadge, hostLabel],
  );

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-start-ticket-sheet"
      desktopMaxWidth={600}
      snapPoints={SNAP_POINTS}
    >
      <View style={styles.body}>
        <Text style={styles.muted}>{GROUPON_TICKET.intro}</Text>
        <View style={styles.field}>
          <Text style={styles.label}>{GROUPON_TICKET.ticketLabel}</Text>
          <EditingTextInput
            initialValue={initial.ticket ?? ""}
            onChangeText={setTicket}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!running}
            placeholder={GROUPON_TICKET.ticketPlaceholder}
            style={styles.input}
            testID="groupon-start-ticket-key"
          />
        </View>
        <Choices
          label={GROUPON_TICKET.repositoryLabel}
          choices={repositoryRows}
          selected={repository?.key ?? null}
          onSelect={setRepositoryKey}
          empty={GROUPON_TICKET.noRepository}
          testIDPrefix="groupon-start-ticket-repository"
        />
        <Choices
          label={GROUPON_TICKET.agentLabel}
          choices={agents}
          selected={shownProvider}
          onSelect={handleProvider}
          empty={GROUPON_TICKET.noAgent}
          testIDPrefix="groupon-start-ticket-agent"
        />
        <Choices
          label={GROUPON_TICKET.modelLabel}
          choices={models}
          selected={shownModel}
          onSelect={handleModel}
          empty={GROUPON_TICKET.noModel}
          testIDPrefix="groupon-start-ticket-model"
        />
        {efforts.length > 0 ? (
          <Choices
            label={GROUPON_TICKET.effortLabel}
            choices={efforts}
            selected={shownEffort}
            onSelect={setEffort}
            empty=""
            testIDPrefix="groupon-start-ticket-effort"
          />
        ) : null}
        <RunState run={run} now={now} onRetry={handleStart} />
        <View style={styles.actions}>
          {problem && ticket.trim() ? <Text style={styles.hint}>{problem}</Text> : null}
          <Button
            variant="default"
            onPress={handleStart}
            loading={running}
            disabled={running || problem !== null}
            testID="groupon-start-ticket-start"
          >
            {GROUPON_TICKET.start}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

function StepMark({ state }: { state: StepState }) {
  if (state === "current") return <ThemedSpinner size={14} />;
  if (state === "done") return <ThemedCheck size={14} uniProps={accentMapping} />;
  if (state === "stopped") return <ThemedX size={14} uniProps={destructiveMapping} />;
  return <ThemedCircle size={14} uniProps={mutedMapping} />;
}

function Steps({ run }: { run: TicketRun }) {
  return (
    <View style={styles.steps} testID="groupon-start-ticket-steps">
      {stepRows(run).map((row) => (
        <View
          key={row.step}
          style={styles.stepRow}
          testID={`groupon-start-ticket-step-${row.step}`}
        >
          <StepMark state={row.state} />
          <Text style={row.state === "pending" ? styles.muted : styles.stepLabel}>{row.label}</Text>
        </View>
      ))}
    </View>
  );
}

function RunState({ run, now, onRetry }: { run: TicketRun; now: number; onRetry: () => void }) {
  const link = run.status === "handed-back" ? run.outcome.link : null;
  const openLink = useCallback(() => {
    if (link) void openExternalUrl(link);
  }, [link]);
  if (run.status === "running") {
    return (
      <View style={styles.handBack}>
        <Steps run={run} />
        <Text style={styles.muted} testID="groupon-start-ticket-phase">
          {run.phase} · {elapsedText(now - run.startedAt)}
        </Text>
        <Text style={styles.muted}>{GROUPON_TICKET.keepsRunning}</Text>
      </View>
    );
  }
  if (run.status === "failed" || run.status === "gave-up") {
    return (
      <View style={styles.handBack}>
        <Steps run={run} />
        <Text style={styles.error} testID="groupon-start-ticket-error">
          {run.error}
        </Text>
        <View style={styles.linkRow}>
          <Button variant="outline" size="sm" onPress={onRetry} testID="groupon-start-ticket-retry">
            {GROUPON_TICKET.retry}
          </Button>
        </View>
      </View>
    );
  }
  if (run.status !== "handed-back") return null;
  return (
    <View style={styles.handBack} testID="groupon-start-ticket-handed-back">
      <Text style={styles.error}>{run.outcome.reason}</Text>
      {run.outcome.questions.map((question) => (
        <Text key={question.label} style={styles.question}>
          {question.label}: {question.note}
        </Text>
      ))}
      <View style={styles.linkRow}>
        <Button variant="outline" size="sm" onPress={openLink}>
          {GROUPON_TICKET.openComment}
        </Button>
      </View>
    </View>
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
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
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
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipSelected: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
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
  question: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  handBack: {
    gap: theme.spacing[2],
  },
  linkRow: {
    flexDirection: "row",
  },
  steps: {
    gap: theme.spacing[1],
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  stepLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[3],
  },
}));
