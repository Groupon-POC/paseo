// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks' column picker, like Jira's.

/**
 * The columns of My tasks, picked the way Jira's list picks them: a searchable list of every field
 * Jira can show, the shown ones ticked and first, a tap switching one on or off, and Restore
 * defaults putting back Jira's own nine. The fields come from the Groupon plugin on the Mac
 * (`groupon.jira-fields`); "Take to development" is not a field and always stays the last column.
 */

import { Check } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SearchField } from "@/components/ui/search-field";
import { useFetchQuery } from "@/data/query";
import type { Theme } from "@/styles/theme";
import { pluginProblemText, readJiraFields, type PluginRpcClient } from "./desk-plugin-rpc";
import {
  DEFAULT_COLUMNS,
  pickerFields,
  sameColumns,
  toggledColumn,
  type FieldChoice,
} from "./jira-tasks-model";
import { GROUPON_TASKS } from "./strings";

const SNAP_POINTS = ["70%", "94%"];
const ThemedCheck = withUnistyles(Check);
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
}));
const accentMapping = (theme: Theme) => ({ color: theme.colors.accent });

export function JiraColumnsSheet({
  client,
  serverId,
  columns,
  onChange,
  onClose,
}: {
  client: PluginRpcClient;
  serverId: string;
  columns: string[];
  onChange: (columns: string[]) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const query = useFetchQuery({
    queryKey: ["groupon-jira-fields", serverId],
    queryFn: () => readJiraFields(client, false),
    dataShape: "value",
    staleTimeMs: 10 * 60_000,
    retry: false,
  });
  const fields = query.data?.fields;
  const listed = useMemo(
    () => pickerFields(fields ?? [], columns, search),
    [columns, fields, search],
  );
  const restore = useCallback(() => onChange([...DEFAULT_COLUMNS]), [onChange]);
  const header = useMemo<SheetHeader>(() => ({ title: GROUPON_TASKS.columnsTitle }), []);
  const problem = query.error ? pluginProblemText(query.error) : query.data?.problem?.message;

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-jira-columns-sheet"
      desktopMaxWidth={480}
      snapPoints={SNAP_POINTS}
    >
      <View style={styles.body}>
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder={GROUPON_TASKS.columnsSearch}
          clearAccessibilityLabel={GROUPON_TASKS.columnsSearchClear}
          testID="groupon-jira-columns-search"
        />
        <View style={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            onPress={restore}
            disabled={sameColumns(columns, DEFAULT_COLUMNS)}
            testID="groupon-jira-columns-restore"
          >
            {GROUPON_TASKS.restoreDefaults}
          </Button>
        </View>
        {query.isLoading ? (
          <View style={styles.status}>
            <ThemedSpinner size={16} />
            <Text style={styles.muted}>{GROUPON_TASKS.fieldsLoading}</Text>
          </View>
        ) : null}
        {problem ? <Text style={styles.error}>{problem}</Text> : null}
        {listed.map((field) => (
          <FieldRow
            key={field.id}
            field={field}
            shown={columns.includes(field.id)}
            columns={columns}
            onChange={onChange}
          />
        ))}
      </View>
    </AdaptiveModalSheet>
  );
}

function FieldRow({
  field,
  shown,
  columns,
  onChange,
}: {
  field: FieldChoice;
  shown: boolean;
  columns: string[];
  onChange: (columns: string[]) => void;
}) {
  const toggle = useCallback(
    () => onChange(toggledColumn(columns, field.id)),
    [columns, field.id, onChange],
  );
  const state = shown ? CHECKED : UNCHECKED;
  return (
    <PressHighlight
      style={styles.row}
      onPress={toggle}
      accessibilityRole="checkbox"
      accessibilityState={state}
      testID={`groupon-jira-column-${field.id}`}
    >
      <View style={styles.check}>
        {shown ? <ThemedCheck size={16} uniProps={accentMapping} /> : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {field.name}
      </Text>
      <Text style={styles.muted} numberOfLines={1}>
        {field.id}
      </Text>
    </PressHighlight>
  );
}

const CHECKED = { checked: true };
const UNCHECKED = { checked: false };

const styles = StyleSheet.create((theme) => ({
  body: {
    gap: theme.spacing[1],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingVertical: theme.spacing[2],
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  check: {
    width: 16,
  },
  name: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
}));
