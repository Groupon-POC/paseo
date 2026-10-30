// Added for Groupon Desk (fork of Paseo, Apache-2.0): an agent's commits and pushes as nodes on a rail in the chat, instead of a shell row with the command as text; each node opens on its own details.

import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { ArrowUp, ChevronDown, ChevronRight } from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PrBadge } from "@/components/sidebar-workspace-list";
import { PressHighlight } from "@/components/ui/press-highlight";
import { formatDiffCount } from "@/git/file-header-presentation";
import { useWorkspacePrHint } from "@/git/use-pr-status-query";
import type { Theme } from "@/styles/theme";
import { useResolvedGitEvents } from "./background-git-events";
import { GitEventDetails } from "./git-event-details";
import type { GitCommitEvent, GitEvent, GitPushEvent } from "./git-events-model";
import { GROUPON_GIT_TIMELINE } from "./strings";

const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedArrowUp = withUnistyles(ArrowUp);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const onAccentColor = (theme: Theme) => ({ color: theme.colors.surface0 });

export function GitTimeline({
  events: callEvents,
  detail,
  serverId,
  cwd,
}: {
  events: readonly GitEvent[];
  detail: ToolCallDetail;
  serverId: string;
  cwd: string;
}): ReactElement {
  const { events, output } = useResolvedGitEvents({ events: callEvents, detail, serverId });
  return (
    <View style={styles.rail} testID="git-timeline">
      <View style={styles.line} />
      {events.map((event, index) => (
        <GitRow
          // oxlint-disable-next-line react/no-array-index-key -- a call's events never reorder
          key={index}
          event={event}
          detail={detail}
          output={output}
          serverId={serverId}
          cwd={cwd}
        />
      ))}
    </View>
  );
}

function GitRow({
  event,
  detail,
  output,
  serverId,
  cwd,
}: {
  event: GitEvent;
  detail: ToolCallDetail;
  output: string;
  serverId: string;
  cwd: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const accessibilityState = useMemo(() => ({ expanded: open }), [open]);
  const Chevron = open ? ThemedChevronDown : ThemedChevronRight;
  return (
    <>
      <PressHighlight
        onPress={toggle}
        style={rowStyle}
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        testID={`git-timeline-${event.kind}`}
      >
        <GitNode event={event} />
        {event.kind === "commit" ? (
          <CommitLine event={event} />
        ) : (
          <PushLine event={event} serverId={serverId} cwd={cwd} />
        )}
        <Chevron size={12} uniProps={mutedColor} />
      </PressHighlight>
      {open ? (
        <View style={styles.details}>
          <GitEventDetails
            event={event}
            detail={detail}
            output={output}
            serverId={serverId}
            cwd={cwd}
          />
        </View>
      ) : null}
    </>
  );
}

function rowStyle({
  pressed,
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered || pressed ? [styles.row, styles.rowHovered] : styles.row;
}

function GitNode({ event }: { event: GitEvent }): ReactElement {
  if (event.status === "failed") return <View style={[styles.node, styles.nodeFailed]} />;
  if (event.kind === "push" && event.status === "done") {
    return (
      <View style={[styles.node, styles.nodePush]}>
        <ThemedArrowUp size={8} strokeWidth={3} uniProps={onAccentColor} />
      </View>
    );
  }
  return <View style={[styles.node, event.status === "running" ? styles.nodeRunning : null]} />;
}

function CommitLine({ event }: { event: GitCommitEvent }): ReactElement {
  if (event.status === "failed") {
    return (
      <Text style={[styles.what, styles.failed]} numberOfLines={1}>
        {GROUPON_GIT_TIMELINE.commitFailed(event.problem)}
      </Text>
    );
  }
  return (
    <>
      <Text style={styles.what} numberOfLines={1}>
        {event.status === "running"
          ? GROUPON_GIT_TIMELINE.committing(event.subject)
          : (event.subject ?? GROUPON_GIT_TIMELINE.commit)}
      </Text>
      {event.additions !== null ? (
        <Text style={styles.added}>+{formatDiffCount(event.additions)}</Text>
      ) : null}
      {event.deletions !== null ? (
        <Text style={styles.removed}>-{formatDiffCount(event.deletions)}</Text>
      ) : null}
      {event.files !== null ? (
        <Text style={styles.muted}>{GROUPON_GIT_TIMELINE.files(event.files)}</Text>
      ) : null}
      {event.sha ? (
        <Text style={styles.sha} selectable>
          {event.sha.slice(0, 7)}
        </Text>
      ) : null}
    </>
  );
}

function PushLine({
  event,
  serverId,
  cwd,
}: {
  event: GitPushEvent;
  serverId: string;
  cwd: string;
}): ReactElement {
  const hint = useWorkspacePrHint({ serverId, cwd, enabled: event.status === "done" });
  if (event.status === "failed") {
    return (
      <Text style={[styles.what, styles.failed]} numberOfLines={1}>
        {GROUPON_GIT_TIMELINE.pushFailed(event.problem)}
      </Text>
    );
  }
  return (
    <>
      <Text style={styles.what} numberOfLines={1}>
        {pushText(event)}
      </Text>
      {event.range ? <Text style={styles.muted}>{event.range}</Text> : null}
      {event.newBranch ? <Text style={styles.chip}>{GROUPON_GIT_TIMELINE.newBranch}</Text> : null}
      {hint && event.status === "done" ? <PrBadge hint={hint} /> : null}
    </>
  );
}

function pushText(event: GitPushEvent): string {
  if (event.status === "running") return GROUPON_GIT_TIMELINE.pushing(event.target);
  if (event.upToDate) return GROUPON_GIT_TIMELINE.upToDate(event.target);
  return GROUPON_GIT_TIMELINE.pushed(event.target);
}

const NODE = 14;
const RAIL_LEFT = 9;

const styles = StyleSheet.create((theme) => ({
  rail: {
    position: "relative",
    paddingLeft: 26,
    marginBottom: theme.spacing[1],
  },
  line: {
    position: "absolute",
    left: RAIL_LEFT,
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: theme.colors.borderAccent,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minHeight: 26,
    paddingVertical: 2,
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowHovered: {
    backgroundColor: theme.colors.surface1,
  },
  node: {
    position: "absolute",
    left: RAIL_LEFT + 1 - NODE / 2 - 26,
    width: NODE,
    height: NODE,
    borderRadius: NODE / 2,
    borderWidth: 2,
    borderColor: theme.colors.foregroundMuted,
    backgroundColor: theme.colors.surface0,
    alignItems: "center",
    justifyContent: "center",
  },
  nodeRunning: {
    borderColor: theme.colors.statusDotRunning,
  },
  nodePush: {
    borderColor: theme.colors.accentBright,
    backgroundColor: theme.colors.accentBright,
  },
  nodeFailed: {
    borderColor: theme.colors.statusDanger,
  },
  sha: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  what: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  failed: {
    color: theme.colors.statusDanger,
  },
  added: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.statusSuccess,
  },
  removed: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.statusDanger,
  },
  muted: {
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  chip: {
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
  },
  details: {
    marginTop: theme.spacing[1],
  },
}));
