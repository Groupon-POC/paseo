// Added for Groupon Desk (fork of Paseo, Apache-2.0): Create PR asks for the ticket a branch does not carry.

/**
 * Create PR on a branch with no ticket, in a repository on the pull-request standard
 * (`ticket-pull-request.ts`): the branch, a field for the ticket's key or link (a key the branch
 * name mentions filled in), the person's open tickets to pick from (a Jira search through the
 * Groupon plugin), and Jira's own Create screen for a ticket that does not exist yet. The button
 * has the plugin name the branch with `groupon ticket name <KEY>`, rename it, and open the pull
 * request with `groupon ticket pr`; the sheet closes on the pull request and keeps the CLI's
 * sentence when it refused.
 *
 * Constraints:
 * - Nothing opens and nothing is renamed before the person gives a key and presses the button
 * - The window never creates a Jira ticket: Create a ticket opens Jira, where the person does
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { useToast } from "@/contexts/toast-context";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { queryClient } from "@/data/query-client";
import { invalidateCheckoutGitQueriesForClient } from "@/git/query-keys";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  type JiraRow,
  pluginProblemText,
  pullRequestOnStandard,
  searchJira,
} from "./desk-plugin-rpc";
import { normalizeTicketKey } from "./start-ticket-model";
import { GROUPON_PULL_REQUEST } from "./strings";
import {
  JIRA_CREATE_URL,
  MY_OPEN_TICKETS_JQL,
  openedProblem,
  type TicketPullRequestRequest,
  useTicketPullRequestStore,
} from "./ticket-pull-request";

const SNAP_POINTS = ["70%", "94%"];
const TASK_LIMIT = 20;

const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

/** Mounted once beside Improve this repository; draws the sheet while Create PR waits on a ticket. */
export function TicketPullRequestSheetHost() {
  const request = useTicketPullRequestStore((state) => state.request);
  const close = useTicketPullRequestStore((state) => state.close);
  if (!request) return null;
  return <TicketPullRequestSheet key={request.id} request={request} onClose={close} />;
}

type Tasks =
  | { status: "loading" }
  | { status: "ready"; rows: JiraRow[] }
  | { status: "failed"; message: string };

type Run = { status: "idle" } | { status: "running" } | { status: "failed"; error: string };

/** The person's open tickets, read once through the plugin on the workspace's Mac. */
function useOpenTickets(serverId: string): Tasks {
  const client = useHostRuntimeClient(serverId);
  const [tasks, setTasks] = useState<Tasks>({ status: "loading" });
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    searchJira(client, {
      jql: MY_OPEN_TICKETS_JQL,
      fields: ["summary"],
      cursor: null,
      limit: TASK_LIMIT,
    })
      .then((answer) => {
        if (cancelled) return;
        setTasks(
          answer.page
            ? { status: "ready", rows: answer.page.data }
            : {
                status: "failed",
                message: answer.problem?.message ?? GROUPON_PULL_REQUEST.noTasks,
              },
        );
        return;
      })
      .catch((error: unknown) => {
        if (!cancelled) setTasks({ status: "failed", message: pluginProblemText(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [client]);
  return tasks;
}

function TicketPullRequestSheet({
  request,
  onClose,
}: {
  request: TicketPullRequestRequest;
  onClose: () => void;
}) {
  const { serverId, cwd, branch } = request;
  const client = useHostRuntimeClient(serverId);
  const toast = useToast();
  const tasks = useOpenTickets(serverId);
  const [ticket, setTicket] = useState(request.suggested ?? "");
  // The field starts again from a picked row: EditingTextInput reads only its initial value.
  const [fieldKey, setFieldKey] = useState(0);
  const [run, setRun] = useState<Run>({ status: "idle" });
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );
  const key = normalizeTicketKey(ticket);
  const running = run.status === "running";

  const pick = useCallback((picked: string) => {
    setTicket(picked);
    setFieldKey((current) => current + 1);
  }, []);

  const open = useCallback(async () => {
    if (!client || !key || running) return;
    setRun({ status: "running" });
    try {
      const outcome = await pullRequestOnStandard(client, { cwd, ticket: key, open: true });
      const problem = openedProblem(outcome);
      if (problem) {
        if (live.current) setRun({ status: "failed", error: problem });
        return;
      }
      await invalidateCheckoutGitQueriesForClient(queryClient, { serverId, cwd });
      toast.show(
        outcome.kind === "opened" && outcome.created
          ? `${GROUPON_PULL_REQUEST.opened}: ${outcome.title ?? outcome.url}`
          : GROUPON_PULL_REQUEST.alreadyOpen,
        { variant: "success" },
      );
      onClose();
    } catch (error) {
      if (live.current) setRun({ status: "failed", error: pluginProblemText(error) });
    }
  }, [client, cwd, key, onClose, running, serverId, toast]);

  const handleOpen = useCallback(() => void open(), [open]);
  const handleCreate = useCallback(() => void openExternalUrl(JIRA_CREATE_URL), []);

  const header = useMemo<SheetHeader>(() => ({ title: GROUPON_PULL_REQUEST.title }), []);

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-ticket-pull-request-sheet"
      desktopMaxWidth={600}
      snapPoints={SNAP_POINTS}
    >
      <View style={styles.body}>
        <Text style={styles.muted}>{GROUPON_PULL_REQUEST.intro}</Text>
        <View style={styles.field}>
          <Text style={styles.label}>{GROUPON_PULL_REQUEST.branchLabel}</Text>
          <Text style={styles.branch} selectable testID="groupon-ticket-pull-request-branch">
            {branch}
          </Text>
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>{GROUPON_PULL_REQUEST.ticketLabel}</Text>
          <EditingTextInput
            key={fieldKey}
            initialValue={ticket}
            onChangeText={setTicket}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!running}
            placeholder={GROUPON_PULL_REQUEST.ticketPlaceholder}
            style={styles.input}
            testID="groupon-ticket-pull-request-key"
          />
          {ticket.trim() && !key ? (
            <Text style={styles.muted}>{GROUPON_PULL_REQUEST.notAKey}</Text>
          ) : null}
        </View>
        <OpenTickets tasks={tasks} selected={key} onPick={pick} disabled={running} />
        <View style={styles.createRow}>
          <Text style={styles.hint}>{GROUPON_PULL_REQUEST.createHint}</Text>
          <Button
            variant="outline"
            size="sm"
            onPress={handleCreate}
            testID="groupon-ticket-pull-request-create"
          >
            {GROUPON_PULL_REQUEST.createInJira}
          </Button>
        </View>
        {run.status === "failed" ? (
          <Text style={styles.error} testID="groupon-ticket-pull-request-error">
            {run.error}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button variant="ghost" onPress={onClose} disabled={running}>
            {GROUPON_PULL_REQUEST.cancel}
          </Button>
          <Button
            variant="default"
            onPress={handleOpen}
            loading={running}
            disabled={running || key === null || !client}
            testID="groupon-ticket-pull-request-open"
          >
            {GROUPON_PULL_REQUEST.open}
          </Button>
        </View>
      </View>
    </AdaptiveModalSheet>
  );
}

function OpenTickets({
  tasks,
  selected,
  onPick,
  disabled,
}: {
  tasks: Tasks;
  selected: string | null;
  onPick: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{GROUPON_PULL_REQUEST.myTasks}</Text>
      {tasks.status === "loading" ? (
        <View style={styles.row}>
          <ThemedSpinner size={14} />
          <Text style={styles.muted}>{GROUPON_PULL_REQUEST.loadingTasks}</Text>
        </View>
      ) : null}
      {tasks.status === "failed" ? <Text style={styles.muted}>{tasks.message}</Text> : null}
      {tasks.status === "ready" && tasks.rows.length === 0 ? (
        <Text style={styles.muted}>{GROUPON_PULL_REQUEST.noTasks}</Text>
      ) : null}
      {tasks.status === "ready"
        ? tasks.rows.map((row) => (
            <TaskRow
              key={row.key}
              row={row}
              selected={row.key === selected}
              onPick={onPick}
              disabled={disabled}
            />
          ))
        : null}
    </View>
  );
}

function TaskRow({
  row,
  selected,
  onPick,
  disabled,
}: {
  row: JiraRow;
  selected: boolean;
  onPick: (key: string) => void;
  disabled: boolean;
}) {
  const handlePress = useCallback(() => onPick(row.key), [onPick, row.key]);
  return (
    <PressHighlight
      onPress={handlePress}
      disabled={disabled}
      style={selected ? styles.taskSelected : styles.task}
      testID={`groupon-ticket-pull-request-task-${row.key}`}
    >
      <Text style={styles.taskKey}>{row.key}</Text>
      <Text style={styles.taskSummary} numberOfLines={1}>
        {row.cells.summary?.text ?? ""}
      </Text>
    </PressHighlight>
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
  branch: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontFamily: "monospace",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  taskSelected: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  taskKey: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  taskSummary: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
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
  actions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[3],
  },
}));
