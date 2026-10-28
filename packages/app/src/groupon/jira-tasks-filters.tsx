// Added for Groupon Desk (fork of Paseo, Apache-2.0): My tasks' filter bar, modelled on Jira's. Its text is a size larger, as the table's.

/**
 * Jira's filter bar over My tasks: Assignee = Current user, Type, Status, Created in the last N
 * days, More filters (free JQL, applied on Enter or when the field is left), Clear filters and the
 * Columns button. Each pill is a menu; Type and Status take several values and stay open while the
 * person ticks them. Every change goes up as a whole new filter set (`onChange`); the card saves it.
 */

import { ChevronDown, Columns3 } from "lucide-react-native";
import { useCallback, useRef } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditingTextInput } from "@/components/ui/text-input";
import type { Theme } from "@/styles/theme";
import {
  assigneeLabel,
  CLEARED_FILTERS,
  CREATED_CHOICES,
  createdLabel,
  listLabel,
  sameFilters,
  toggled,
  type JiraFilters,
} from "./jira-tasks-model";
import { GROUPON_TASKS } from "./strings";

const ThemedChevron = withUnistyles(ChevronDown);
const ThemedInput = withUnistyles(EditingTextInput, (theme: Theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.foreground,
}));
const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

interface BarProps {
  filters: JiraFilters;
  typeChoices: string[];
  statusChoices: string[];
  onChange: (filters: JiraFilters) => void;
  onColumns: () => void;
}

export function JiraFilterBar({
  filters,
  typeChoices,
  statusChoices,
  onChange,
  onColumns,
}: BarProps) {
  const clear = useCallback(() => onChange(CLEARED_FILTERS), [onChange]);
  const setTypes = useCallback(
    (types: string[]) => onChange({ ...filters, types }),
    [filters, onChange],
  );
  const setStatuses = useCallback(
    (statuses: string[]) => onChange({ ...filters, statuses }),
    [filters, onChange],
  );
  const applyMore = useCallback(
    (more: string) => {
      if (more.trim() !== filters.more) onChange({ ...filters, more: more.trim() });
    },
    [filters, onChange],
  );
  return (
    <View style={styles.bar}>
      <AssigneePill filters={filters} onChange={onChange} />
      <MultiPill
        name={GROUPON_TASKS.type}
        values={filters.types}
        choices={typeChoices}
        onChange={setTypes}
        testID="groupon-jira-filter-type"
      />
      <MultiPill
        name={GROUPON_TASKS.status}
        values={filters.statuses}
        choices={statusChoices}
        onChange={setStatuses}
        testID="groupon-jira-filter-status"
      />
      <CreatedPill filters={filters} onChange={onChange} />
      <MoreFilters key={filters.more} value={filters.more} onApply={applyMore} />
      <Button
        variant="ghost"
        size="sm"
        onPress={clear}
        disabled={sameFilters(filters, CLEARED_FILTERS)}
        testID="groupon-jira-filter-clear"
      >
        {GROUPON_TASKS.clearFilters}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={Columns3}
        onPress={onColumns}
        testID="groupon-jira-columns"
      >
        {GROUPON_TASKS.columns}
      </Button>
    </View>
  );
}

function PillTrigger({ label, active }: { label: string; active: boolean }) {
  return (
    <View style={active ? styles.pillActive : styles.pill}>
      <Text style={active ? styles.pillTextActive : styles.pillText} numberOfLines={1}>
        {label}
      </Text>
      <ThemedChevron size={12} uniProps={mutedMapping} />
    </View>
  );
}

function AssigneePill({
  filters,
  onChange,
}: {
  filters: JiraFilters;
  onChange: (filters: JiraFilters) => void;
}) {
  const mine = useCallback(() => onChange({ ...filters, mine: true }), [filters, onChange]);
  const anyone = useCallback(() => onChange({ ...filters, mine: false }), [filters, onChange]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        accessibilityLabel={assigneeLabel(filters.mine)}
        testID="groupon-jira-filter-assignee"
      >
        <PillTrigger label={assigneeLabel(filters.mine)} active={filters.mine} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={mine} selected={filters.mine} showSelectedCheck>
          {GROUPON_TASKS.assigneeMine}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={anyone} selected={!filters.mine} showSelectedCheck>
          {GROUPON_TASKS.assigneeAnyone}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MultiPill({
  name,
  values,
  choices,
  onChange,
  testID,
}: {
  name: string;
  values: string[];
  choices: string[];
  onChange: (values: string[]) => void;
  testID: string;
}) {
  const label = listLabel(name, values);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger accessibilityLabel={label} testID={testID}>
        <PillTrigger label={label} active={values.length > 0} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" scrollable maxHeight={320}>
        {choices.map((choice) => (
          <ChoiceItem key={choice} choice={choice} values={values} onChange={onChange} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChoiceItem({
  choice,
  values,
  onChange,
}: {
  choice: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const select = useCallback(() => onChange(toggled(values, choice)), [choice, onChange, values]);
  return (
    <DropdownMenuItem
      onSelect={select}
      selected={values.includes(choice)}
      showSelectedCheck
      closeOnSelect={false}
    >
      {choice}
    </DropdownMenuItem>
  );
}

function CreatedPill({
  filters,
  onChange,
}: {
  filters: JiraFilters;
  onChange: (filters: JiraFilters) => void;
}) {
  const label = createdLabel(filters.createdWithinDays);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger accessibilityLabel={label} testID="groupon-jira-filter-created">
        <PillTrigger label={label} active={filters.createdWithinDays !== null} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {CREATED_CHOICES.map((days) => (
          <CreatedItem key={days ?? "any"} days={days} filters={filters} onChange={onChange} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CreatedItem({
  days,
  filters,
  onChange,
}: {
  days: number | null;
  filters: JiraFilters;
  onChange: (filters: JiraFilters) => void;
}) {
  const select = useCallback(
    () => onChange({ ...filters, createdWithinDays: days }),
    [days, filters, onChange],
  );
  return (
    <DropdownMenuItem
      onSelect={select}
      selected={filters.createdWithinDays === days}
      showSelectedCheck
    >
      {days === null ? GROUPON_TASKS.anyTime : GROUPON_TASKS.lastDays.replace("{n}", String(days))}
    </DropdownMenuItem>
  );
}

/** Free JQL, kept as typed until Enter or leaving the field: a half-typed query is never run. */
function MoreFilters({ value, onApply }: { value: string; onApply: (more: string) => void }) {
  const typed = useRef(value);
  const remember = useCallback((text: string) => {
    typed.current = text;
  }, []);
  const apply = useCallback(() => onApply(typed.current), [onApply]);
  return (
    <ThemedInput
      initialValue={value}
      onChangeText={remember}
      onSubmitEditing={apply}
      onBlur={apply}
      placeholder={GROUPON_TASKS.moreFiltersPlaceholder}
      accessibilityLabel={GROUPON_TASKS.moreFilters}
      autoCapitalize="none"
      autoCorrect={false}
      style={styles.more}
      testID="groupon-jira-filter-more"
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pillActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  pillText: {
    color: theme.colors.foregroundMuted,
    fontSize: 13,
    maxWidth: 260,
  },
  pillTextActive: {
    color: theme.colors.foreground,
    fontSize: 13,
    maxWidth: 260,
  },
  more: {
    minWidth: 240,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    color: theme.colors.foreground,
    fontSize: 13,
  },
}));
