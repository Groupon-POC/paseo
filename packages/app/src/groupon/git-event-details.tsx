// Added for Groupon Desk (fork of Paseo, Apache-2.0): what an opened commit or push node shows: the commit's message and files, the commits a push carried, git's reason for a failure; the command only on request.

import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { useCallback, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useFetchQuery } from "@/data/query";
import { formatDiffCount } from "@/git/file-header-presentation";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import {
  type GitCommitDetails,
  type GitFileChange,
  problemLinesOf,
  readGitDetails,
  repositoryFolderOf,
} from "./git-details-model";
import type { GitEvent } from "./git-events-model";
import { GROUPON_GIT_TIMELINE } from "./strings";

/** A commit's files shown before "and N more". */
const SHOWN_FILES = 12;
const DETAILS_STALE_MS = 10 * 60_000;

export function GitEventDetailsList({
  events,
  detail,
  serverId,
  cwd,
}: {
  events: readonly GitEvent[];
  detail: ToolCallDetail;
  serverId: string;
  cwd: string;
}): ReactElement {
  const output = detail.type === "shell" ? (detail.output ?? "") : "";
  return (
    <View style={styles.list}>
      {events.map((event, index) => (
        <GitEventDetails
          // oxlint-disable-next-line react/no-array-index-key -- a call's events never reorder
          key={index}
          event={event}
          serverId={serverId}
          cwd={repositoryFolderOf(cwd, event.dir)}
          output={output}
        />
      ))}
      <RawCommand detail={detail} />
    </View>
  );
}

function GitEventDetails({
  event,
  serverId,
  cwd,
  output,
}: {
  event: GitEvent;
  serverId: string;
  cwd: string;
  output: string;
}): ReactElement {
  if (event.status === "failed") return <FailureLines problem={event.problem} output={output} />;
  const revision = event.kind === "commit" ? event.sha : event.range;
  if (!revision) {
    const note =
      event.kind === "push" ? GROUPON_GIT_TIMELINE.nothingPushed : GROUPON_GIT_TIMELINE.noSha;
    return <Text style={styles.note}>{note}</Text>;
  }
  return (
    <CommittedDetails
      serverId={serverId}
      cwd={cwd}
      revision={revision}
      push={event.kind === "push"}
    />
  );
}

function CommittedDetails({
  serverId,
  cwd,
  revision,
  push,
}: {
  serverId: string;
  cwd: string;
  revision: string;
  push: boolean;
}): ReactElement {
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const query = useFetchQuery({
    queryKey: ["groupon-git-details", serverId, cwd, revision],
    queryFn: async () => (client ? readGitDetails(client, cwd, revision) : []),
    enabled: Boolean(client) && connected,
    dataShape: "value",
    retry: false,
    staleTimeMs: DETAILS_STALE_MS,
  });
  if (query.isError) return <Text style={styles.note}>{GROUPON_GIT_TIMELINE.unreadable}</Text>;
  if (!query.data) return <Text style={styles.note}>{GROUPON_GIT_TIMELINE.reading}</Text>;
  if (push) return <PushedCommits commits={query.data} />;
  const [commit] = query.data;
  return commit ? (
    <CommitView commit={commit} />
  ) : (
    <Text style={styles.note}>{GROUPON_GIT_TIMELINE.unreadable}</Text>
  );
}

function CommitView({ commit }: { commit: GitCommitDetails }): ReactElement {
  const more = commit.files.length - SHOWN_FILES + commit.moreFiles;
  return (
    <View style={styles.block}>
      <Text style={styles.subject}>{commit.subject}</Text>
      {commit.body ? (
        <Text style={styles.body} numberOfLines={8}>
          {commit.body}
        </Text>
      ) : null}
      <View style={styles.files}>
        {commit.files.slice(0, SHOWN_FILES).map((file) => (
          <FileRow key={file.path} file={file} />
        ))}
        {more > 0 ? <Text style={styles.note}>{GROUPON_GIT_TIMELINE.moreFiles(more)}</Text> : null}
      </View>
    </View>
  );
}

function FileRow({ file }: { file: GitFileChange }): ReactElement {
  return (
    <View style={styles.fileRow}>
      <Text style={styles.path} numberOfLines={1}>
        {file.path}
      </Text>
      {file.additions === null ? (
        <Text style={styles.note}>{GROUPON_GIT_TIMELINE.binary}</Text>
      ) : (
        <>
          <Text style={styles.added}>+{formatDiffCount(file.additions)}</Text>
          <Text style={styles.removed}>-{formatDiffCount(file.deletions ?? 0)}</Text>
        </>
      )}
    </View>
  );
}

function PushedCommits({ commits }: { commits: readonly GitCommitDetails[] }): ReactElement {
  return (
    <View style={styles.block}>
      <Text style={styles.note}>{GROUPON_GIT_TIMELINE.commitsPushed(commits.length)}</Text>
      {commits.map((commit) => (
        <View key={commit.sha} style={styles.fileRow}>
          <Text style={styles.sha} selectable>
            {commit.sha.slice(0, 7)}
          </Text>
          <Text style={styles.subjectLine} numberOfLines={1}>
            {commit.subject}
          </Text>
        </View>
      ))}
    </View>
  );
}

function FailureLines({
  problem,
  output,
}: {
  problem: string | null;
  output: string;
}): ReactElement {
  const lines = problemLinesOf(output).filter((line) => line !== problem);
  return (
    <View style={styles.block}>
      <Text style={styles.failed}>{problem ?? GROUPON_GIT_TIMELINE.failedNoReason}</Text>
      {lines.map((line, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- the lines of one output never reorder
        <Text key={index} style={styles.path} selectable>
          {line}
        </Text>
      ))}
    </View>
  );
}

function RawCommand({ detail }: { detail: ToolCallDetail }): ReactElement {
  const [shown, setShown] = useState(false);
  const toggle = useCallback(() => setShown((value) => !value), []);
  return (
    <View>
      <PressHighlight onPress={toggle} accessibilityRole="button" style={styles.rawToggle}>
        <Text style={styles.note}>
          {shown ? GROUPON_GIT_TIMELINE.hideCommand : GROUPON_GIT_TIMELINE.showCommand}
        </Text>
      </PressHighlight>
      {shown ? <ToolCallDetailsContent detail={detail} maxHeight={200} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[2],
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  block: {
    gap: theme.spacing[1],
  },
  subject: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  subjectLine: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  body: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  files: {
    gap: 2,
    marginTop: theme.spacing[1],
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  path: {
    flexShrink: 1,
    minWidth: 0,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  sha: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
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
  failed: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.statusDanger,
  },
  note: {
    fontSize: theme.fontSize.code,
    color: theme.colors.foregroundMuted,
  },
  rawToggle: {
    alignSelf: "flex-start",
    paddingVertical: 2,
  },
}));
