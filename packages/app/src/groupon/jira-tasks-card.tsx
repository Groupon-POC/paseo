// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks under the New workspace page's composer.

/**
 * The person's Jira tasks under the composer: Jira's filter bar, the table with the person's
 * columns, paging, and as the last column "Take to development", which opens Start a ticket with
 * that key (the Groupon plugin then runs `groupon ticket start` on the chosen Mac). The Groupon
 * plugin on the page's Mac reads everything (`groupon.jira-search`, `groupon.jira-fields`,
 * `groupon.jira-saved-view`) with that Mac's CLI session; the platform runs the search with its own
 * Jira account inside its scope. Every change to the filters or the columns is saved, once the
 * person stops changing things, as their default, which every window opens with.
 *
 * Not drawn on a phone-sized layout (the composer sits at the bottom there, under the thumb), nor
 * while no Mac is connected.
 */

import { ExternalLink, Play } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useFetchQuery } from "@/data/query";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  jiraSavedView,
  pluginProblemText,
  searchJira,
  type JiraCell,
  type JiraField,
  type JiraRow,
  type JiraSearchPage,
  type PluginRpcClient,
} from "./desk-plugin-rpc";
import { JiraColumnsSheet } from "./jira-tasks-columns";
import { JiraFilterBar } from "./jira-tasks-filters";
import {
  cellText,
  choicesWith,
  columnWidth,
  FIRST_PAGE,
  nextPage,
  PAGE_SIZE,
  pageRangeText,
  previousPage,
  problemFrom,
  SAVE_DELAY_MS,
  STATUS_CHOICES,
  stateFromView,
  TYPE_CHOICES,
  viewFromState,
  type JiraFilters,
  type PageTrail,
  type TasksState,
} from "./jira-tasks-model";
import { GROUPON_TASKS } from "./strings";

const TAKE_WIDTH = 190;
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));

/** Mounted once on the New workspace page; draws nothing on a phone or without a Mac. */
export function JiraTasksCard({
  serverId,
  onTakeTicket,
}: {
  serverId: string;
  onTakeTicket: (ticket: string) => void;
}) {
  const compact = useIsCompactFormFactor();
  const client = useHostRuntimeClient(serverId);
  if (compact || !client) return null;
  return <TasksCard client={client} serverId={serverId} onTakeTicket={onTakeTicket} />;
}

/** The saved view once, then the person's own changes, each saved after a pause. */
function useTasksState(client: PluginRpcClient, serverId: string) {
  const viewQuery = useFetchQuery({
    queryKey: ["groupon-jira-saved-view", serverId],
    queryFn: () => jiraSavedView(client),
    dataShape: "value",
    staleTimeMs: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const [state, setState] = useState<TasksState | null>(null);
  const [saveProblem, setSaveProblem] = useState<string | null>(null);
  const changed = useRef(false);
  const loaded = viewQuery.data ?? null;
  const failed = viewQuery.error !== null;

  useEffect(() => {
    if (state !== null) return;
    if (loaded) setState(stateFromView(loaded.view));
    else if (failed) setState(stateFromView(null));
  }, [failed, loaded, state]);

  useEffect(() => {
    if (!state || !changed.current) return undefined;
    const timer = setTimeout(() => {
      jiraSavedView(client, viewFromState(state))
        .then((answer) => setSaveProblem(answer.problem?.message ?? null))
        .catch((error: unknown) => setSaveProblem(pluginProblemText(error)));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [client, state]);

  const update = useCallback((next: TasksState) => {
    changed.current = true;
    setState(next);
  }, []);
  return { state, update, saveProblem };
}

/** One page of the search for the state, the trail of pages walked, and what to say instead of rows. */
function useTasksSearch(client: PluginRpcClient, serverId: string, state: TasksState | null) {
  const [trail, setTrail] = useState<PageTrail>(FIRST_PAGE);
  const jql = state ? viewFromState(state).jql : "";
  const columns = state?.columns ?? NO_COLUMNS;
  const cursor = trail[trail.length - 1] ?? null;
  const search = useFetchQuery({
    queryKey: ["groupon-jira-search", serverId, jql, columns.join(","), cursor],
    queryFn: () => searchJira(client, { jql, fields: columns, cursor, limit: PAGE_SIZE }),
    enabled: state !== null,
    dataShape: "value",
    staleTimeMs: 30_000,
    retry: false,
  });
  const page = search.data?.page ?? null;
  const problem = problemFrom(
    search.data?.problem ?? null,
    search.error ? pluginProblemText(search.error) : null,
  );
  const problemText = problem?.kind === "signed-out" ? GROUPON_TASKS.signedOut : problem?.message;
  return {
    page,
    trail,
    setTrail,
    problemText: problemText ?? null,
    loading: state === null || search.isLoading,
  };
}

/** A pill's choices: the usual ones, the person's own and what the page showed. */
function usePillChoices(state: TasksState | null, page: JiraSearchPage | null) {
  const rows = page?.data;
  const types = state?.filters.types;
  const statuses = state?.filters.statuses;
  return useMemo(() => {
    const seen = seenValues(rows ?? []);
    return {
      typeChoices: choicesWith(TYPE_CHOICES, types ?? [], seen.types),
      statusChoices: choicesWith(STATUS_CHOICES, statuses ?? [], seen.statuses),
    };
  }, [rows, statuses, types]);
}

function TasksCard({
  client,
  serverId,
  onTakeTicket,
}: {
  client: PluginRpcClient;
  serverId: string;
  onTakeTicket: (ticket: string) => void;
}) {
  const { state, update, saveProblem } = useTasksState(client, serverId);
  const { page, trail, setTrail, problemText, loading } = useTasksSearch(client, serverId, state);
  const { typeChoices, statusChoices } = usePillChoices(state, page);
  const [picking, setPicking] = useState(false);

  const setFilters = useCallback(
    (filters: JiraFilters) => {
      if (!state) return;
      setTrail(FIRST_PAGE);
      update({ ...state, filters });
    },
    [setTrail, state, update],
  );
  const setColumns = useCallback(
    (next: string[]) => {
      if (!state) return;
      setTrail(FIRST_PAGE);
      update({ ...state, columns: next });
    },
    [setTrail, state, update],
  );
  const openColumns = useCallback(() => setPicking(true), []);
  const closeColumns = useCallback(() => setPicking(false), []);

  return (
    <View style={styles.card} testID="groupon-jira-tasks">
      <View style={styles.heading}>
        <Text style={styles.title}>{GROUPON_TASKS.title}</Text>
        <Text style={styles.caption}>{GROUPON_TASKS.caption}</Text>
      </View>
      {state ? (
        <JiraFilterBar
          filters={state.filters}
          typeChoices={typeChoices}
          statusChoices={statusChoices}
          onChange={setFilters}
          onColumns={openColumns}
        />
      ) : null}
      {saveProblem ? (
        <Text style={styles.error}>
          {GROUPON_TASKS.notSaved} {saveProblem}
        </Text>
      ) : null}
      <TasksBody
        loading={loading}
        problem={problemText}
        fields={page?.fields ?? NO_FIELDS}
        rows={page?.data ?? NO_ROWS}
        onTakeTicket={onTakeTicket}
      />
      {page ? <Paging page={page} trail={trail} onTrail={setTrail} /> : null}
      {picking && state ? (
        <JiraColumnsSheet
          client={client}
          serverId={serverId}
          columns={state.columns}
          onChange={setColumns}
          onClose={closeColumns}
        />
      ) : null}
    </View>
  );
}

const NO_COLUMNS: string[] = [];
const NO_FIELDS: JiraField[] = [];
const NO_ROWS: JiraRow[] = [];

function Paging({
  page,
  trail,
  onTrail,
}: {
  page: JiraSearchPage;
  trail: PageTrail;
  onTrail: (update: (trail: PageTrail) => PageTrail) => void;
}) {
  const nextCursor = page.nextCursor;
  const next = useCallback(
    () => onTrail((now) => nextPage(now, nextCursor)),
    [nextCursor, onTrail],
  );
  const previous = useCallback(() => onTrail(previousPage), [onTrail]);
  if (page.data.length === 0) return null;
  return (
    <View style={styles.paging}>
      <Text style={styles.muted}>{pageRangeText(trail, page.data.length, page.total)}</Text>
      <Button variant="ghost" size="sm" onPress={previous} disabled={trail.length <= 1}>
        {GROUPON_TASKS.previous}
      </Button>
      <Button variant="ghost" size="sm" onPress={next} disabled={!nextCursor}>
        {GROUPON_TASKS.next}
      </Button>
    </View>
  );
}

/** The work types and statuses the page showed, so a pill offers what this person's Jira has. */
function seenValues(rows: JiraRow[]): { types: string[]; statuses: string[] } {
  const types = rows.map((row) => row.cells.issuetype?.text ?? "");
  const statuses = rows.map((row) => row.cells.status?.text ?? "");
  return { types, statuses };
}

function TasksBody({
  loading,
  problem,
  fields,
  rows,
  onTakeTicket,
}: {
  loading: boolean;
  problem: string | null;
  fields: JiraField[];
  rows: JiraRow[];
  onTakeTicket: (ticket: string) => void;
}) {
  if (problem) return <Text style={styles.error}>{problem}</Text>;
  if (loading) {
    return (
      <View style={styles.status}>
        <ThemedSpinner size={16} />
        <Text style={styles.muted}>{GROUPON_TASKS.loading}</Text>
      </View>
    );
  }
  if (rows.length === 0) return <Text style={styles.muted}>{GROUPON_TASKS.noTasks}</Text>;
  return (
    <ScrollView horizontal style={styles.tableScroll}>
      <View>
        <HeaderRow fields={fields} />
        <ScrollView style={styles.rows}>
          {rows.map((row) => (
            <TaskRow key={row.key} row={row} fields={fields} onTakeTicket={onTakeTicket} />
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function HeaderRow({ fields }: { fields: JiraField[] }) {
  return (
    <View style={styles.headerRow}>
      {fields.map((field) => (
        <HeaderCell key={field.id} field={field} />
      ))}
      <View style={styles.takeCell}>
        <Text style={styles.headerText}>{GROUPON_TASKS.take}</Text>
      </View>
    </View>
  );
}

function HeaderCell({ field }: { field: JiraField }) {
  const width = useMemo(
    () => ({ width: columnWidth(field.id, field.kind) }),
    [field.id, field.kind],
  );
  return (
    <View style={[styles.cell, width]}>
      <Text style={styles.headerText} numberOfLines={1}>
        {field.name}
      </Text>
    </View>
  );
}

function TaskRow({
  row,
  fields,
  onTakeTicket,
}: {
  row: JiraRow;
  fields: JiraField[];
  onTakeTicket: (ticket: string) => void;
}) {
  const take = useCallback(() => onTakeTicket(row.key), [onTakeTicket, row.key]);
  return (
    <View style={styles.row} testID={`groupon-jira-row-${row.key}`}>
      {fields.map((field) => (
        <TaskCell key={field.id} field={field} cell={row.cells[field.id] ?? null} />
      ))}
      <View style={styles.takeCell}>
        <Button
          variant="outline"
          size="sm"
          leftIcon={Play}
          onPress={take}
          testID={`groupon-jira-take-${row.key}`}
        >
          {GROUPON_TASKS.take}
        </Button>
      </View>
    </View>
  );
}

function TaskCell({ field, cell }: { field: JiraField; cell: JiraCell | null }) {
  const width = useMemo(
    () => ({ width: columnWidth(field.id, field.kind) }),
    [field.id, field.kind],
  );
  const url = cell?.url ?? null;
  const open = useCallback(() => {
    if (url) void openExternalUrl(url);
  }, [url]);
  const text = cell ? cellText(cell.text, field.kind) : "";
  if (field.kind === "status" && cell) {
    return (
      <View style={[styles.cell, width]}>
        <View style={toneOf(cell.category)}>
          <Text style={styles.statusText} numberOfLines={1}>
            {text}
          </Text>
        </View>
      </View>
    );
  }
  if (url) {
    return (
      <PressHighlight
        style={[styles.cell, styles.linkCell, width]}
        onPress={open}
        accessibilityRole="link"
      >
        <Text style={styles.link} numberOfLines={1}>
          {text}
        </Text>
        <ExternalLinkIcon />
      </PressHighlight>
    );
  }
  return (
    <View style={[styles.cell, width]}>
      <Text style={styles.cellText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const ThemedExternalLink = withUnistyles(ExternalLink);
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function ExternalLinkIcon() {
  return <ThemedExternalLink size={12} uniProps={mutedMapping} />;
}

function toneOf(category: string | null) {
  if (category === "done") return styles.statusDone;
  if (category === "in_progress") return styles.statusMoving;
  return styles.statusTodo;
}

const styles = StyleSheet.create((theme) => ({
  card: {
    flexShrink: 1,
    maxHeight: "55%",
    width: "100%",
    maxWidth: 1280,
    alignSelf: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[6],
    paddingBottom: theme.spacing[4],
  },
  heading: {
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
  },
  caption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  tableScroll: {
    flexGrow: 0,
    flexShrink: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
  },
  rows: {
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cell: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    justifyContent: "center",
  },
  linkCell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[1],
  },
  takeCell: {
    width: TAKE_WIDTH,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    justifyContent: "center",
  },
  headerText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  cellText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  link: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.sm,
    flexShrink: 1,
  },
  statusText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  statusTodo: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  statusMoving: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.statusWarningTint,
  },
  statusDone: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.statusSuccessTint,
  },
  paging: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
  },
}));
