// Added for Groupon Desk (fork of Paseo, Apache-2.0): the file viewer's blame bar: who last changed the cursor's line and who wrote the file, each with a card on hover (a sheet on a phone).

import { Check, Copy, FileDiff, GitPullRequest } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AdaptiveModalSheet } from "@/components/adaptive-modal-sheet";
import { DiffStat } from "@/components/diff-stat";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useFetchQuery } from "@/data/query";
import { forgeFromRemoteUrl, getForgePresentation } from "@/git/forge";
import { buildForgeChangeRequestUrl } from "@/git/forge-url";
import { deriveAvatarColor, formatAge } from "@/git/pull-request-panel/data";
import { useCheckoutStatusQuery } from "@/git/use-status-query";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import { FOCUSED_PANE_PLACEMENT, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { copyToClipboard } from "@/utils/copy-to-clipboard";
import { openExternalUrl } from "@/utils/open-external-url";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  type BlameCommit,
  changeRequestNumberOf,
  commitAtLine,
  type FileAuthor,
  type FileBlame,
  fileAuthors,
  newestCommit,
  readFileBlame,
  workspaceRelativePath,
} from "./file-blame-model";
import { readGitDetails } from "./git-details-model";
import { initials } from "./presence-model";
import { GROUPON_BLAME } from "./strings";

const BLAME_STALE_MS = 5 * 60_000;
const DETAILS_STALE_MS = 10 * 60_000;
const CARD_WIDTH = 380;
const STACKED_AVATARS = 4;
const COPIED_FOR_MS = 2000;
const AUTHORS_CARD_WIDTH = 300;
const SHEET_SNAP_POINTS = ["50%", "85%"];

type Blamed = Extract<FileBlame, { state: "blamed" }>;

interface BarContext {
  serverId: string;
  workspaceId: string;
  directory: string;
}

export interface FileBlameBarProps {
  serverId: string;
  workspaceId: string;
  /** Absolute, as the panel's file holds it. */
  filePath: string;
  /** The file's version on disk; a new one reads the blame again. */
  modifiedAt: string;
  /** The cursor's line; null in a viewer without a cursor, which shows the file's last commit. */
  line: number | null;
}

export function FileBlameBar({
  serverId,
  workspaceId,
  filePath,
  modifiedAt,
  line,
}: FileBlameBarProps): ReactElement | null {
  const directory = useWorkspaceDirectory(serverId, workspaceId);
  const path = directory ? workspaceRelativePath(directory, filePath) : null;
  const client = useHostRuntimeClient(serverId);
  const connected = useHostRuntimeIsConnected(serverId);
  const query = useFetchQuery({
    queryKey: ["groupon-file-blame", serverId, workspaceId, path, modifiedAt],
    queryFn: async () => (client && path ? readFileBlame(client, workspaceId, path) : null),
    enabled: Boolean(client && path) && connected,
    dataShape: "list",
    retry: false,
    staleTimeMs: BLAME_STALE_MS,
  });
  const context = useMemo(
    () => (directory ? { serverId, workspaceId, directory } : null),
    [directory, serverId, workspaceId],
  );
  if (!context || !path) return null;
  if (query.isError) return <QuietBar text={GROUPON_BLAME.unavailable} />;
  if (query.data === undefined) {
    return connected ? <QuietBar text={GROUPON_BLAME.loading} /> : null;
  }
  const blame = query.data;
  if (!blame || blame.state === "outside-git") return null;
  if (blame.state === "untracked") return <QuietBar text={GROUPON_BLAME.newFile} />;
  return <BlamedBar blame={blame} line={line} context={context} />;
}

function QuietBar({ text }: { text: string }): ReactElement {
  return (
    <View style={styles.bar} testID="file-blame-bar">
      <Text style={styles.quiet} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function BlamedBar({
  blame,
  line,
  context,
}: {
  blame: Blamed;
  line: number | null;
  context: BarContext;
}): ReactElement {
  const commit = line === null ? newestCommit(blame) : commitAtLine(blame, line);
  const authors = useMemo(() => fileAuthors(blame), [blame]);
  const lineCount = useMemo(
    () => blame.ranges.reduce((total, range) => total + range.count, 0),
    [blame],
  );
  return (
    <View style={styles.bar} testID="file-blame-bar">
      <View style={styles.lineSide}>
        {commit ? <CommitItem commit={commit} context={context} /> : null}
      </View>
      <AuthorsItem authors={authors} lineCount={lineCount} />
    </View>
  );
}

/** A bar item's card shows on hover on a desktop, and as a sheet on a press elsewhere. */
function useReveal(title: string) {
  const isCompact = useIsCompactFormFactor();
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const header = useMemo(() => ({ title }), [title]);
  return { asSheet: isCompact || isNative, visible, open, close, header };
}

function CommitItem({ commit, context }: { commit: BlameCommit; context: BarContext }) {
  const reveal = useReveal(commit.uncommitted ? GROUPON_BLAME.notCommitted : commit.author);
  const card = <CommitCard commit={commit} context={context} onDone={reveal.close} />;
  if (reveal.asSheet) {
    return (
      <>
        <PressHighlight
          onPress={reveal.open}
          accessibilityRole="button"
          accessibilityLabel={GROUPON_BLAME.commitAccessibility}
          style={styles.item}
          testID="file-blame-commit"
        >
          <CommitSummary commit={commit} context={context} />
        </PressHighlight>
        <AdaptiveModalSheet
          header={reveal.header}
          visible={reveal.visible}
          onClose={reveal.close}
          snapPoints={SHEET_SNAP_POINTS}
          testID="file-blame-commit-sheet"
        >
          {card}
        </AdaptiveModalSheet>
      </>
    );
  }
  return (
    <HoverCard>
      <HoverCardTrigger>
        <View
          style={styles.item}
          accessibilityLabel={GROUPON_BLAME.commitAccessibility}
          testID="file-blame-commit"
        >
          <CommitSummary commit={commit} context={context} />
        </View>
      </HoverCardTrigger>
      <HoverCardContent
        placement="top"
        alignment="start"
        offset={6}
        style={styles.card}
        testID="file-blame-commit-card"
      >
        {card}
      </HoverCardContent>
    </HoverCard>
  );
}

function AuthorsItem({ authors, lineCount }: { authors: FileAuthor[]; lineCount: number }) {
  const reveal = useReveal(GROUPON_BLAME.authorsTitle);
  const card = <AuthorsCard authors={authors} lineCount={lineCount} />;
  if (reveal.asSheet) {
    return (
      <>
        <PressHighlight
          onPress={reveal.open}
          accessibilityRole="button"
          accessibilityLabel={GROUPON_BLAME.authorsAccessibility}
          style={styles.item}
          testID="file-blame-authors"
        >
          <AuthorStack authors={authors} />
        </PressHighlight>
        <AdaptiveModalSheet
          header={reveal.header}
          visible={reveal.visible}
          onClose={reveal.close}
          snapPoints={SHEET_SNAP_POINTS}
          testID="file-blame-authors-sheet"
        >
          {card}
        </AdaptiveModalSheet>
      </>
    );
  }
  return (
    <HoverCard>
      <HoverCardTrigger>
        <View
          style={styles.item}
          accessibilityLabel={GROUPON_BLAME.authorsAccessibility}
          testID="file-blame-authors"
        >
          <AuthorStack authors={authors} />
        </View>
      </HoverCardTrigger>
      <HoverCardContent
        placement="top"
        alignment="end"
        offset={6}
        style={styles.authorsCard}
        testID="file-blame-authors-card"
      >
        {card}
      </HoverCardContent>
    </HoverCard>
  );
}

function Avatar({ name, large = false }: { name: string | null; large?: boolean }): ReactElement {
  const label = name ?? GROUPON_BLAME.you;
  return (
    <View
      style={[
        large ? styles.avatarLarge : styles.avatar,
        name ? { backgroundColor: deriveAvatarColor(name) } : styles.avatarYou,
      ]}
    >
      <Text style={large ? styles.avatarTextLarge : styles.avatarText}>{initials(label)}</Text>
    </View>
  );
}

function CommitSummary({
  commit,
  context,
}: {
  commit: BlameCommit;
  context: BarContext;
}): ReactElement {
  const pullRequest = usePullRequestLink(context, commit);
  if (commit.uncommitted) {
    return (
      <>
        <Avatar name={null} />
        <Text style={styles.author}>{GROUPON_BLAME.you}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          · {GROUPON_BLAME.notCommitted}
        </Text>
      </>
    );
  }
  return (
    <>
      <Avatar name={commit.author} />
      <Text style={styles.author} numberOfLines={1}>
        {commit.author}
      </Text>
      <Text style={styles.muted}>· {formatAge(Date.parse(commit.at))}</Text>
      <Text style={styles.subject} numberOfLines={1}>
        · {commit.subject}
      </Text>
      {pullRequest ? (
        <View style={styles.chip}>
          <Text style={styles.chipText}>{pullRequest.label}</Text>
        </View>
      ) : null}
    </>
  );
}

function AuthorStack({ authors }: { authors: FileAuthor[] }): ReactElement {
  return (
    <>
      <View style={styles.stack}>
        {authors.slice(0, STACKED_AVATARS).map((author, index) => (
          <View key={author.name ?? ""} style={index > 0 ? styles.stacked : null}>
            <Avatar name={author.name} />
          </View>
        ))}
      </View>
      <Text style={styles.muted}>{GROUPON_BLAME.authors(authors.length)}</Text>
    </>
  );
}

function CommitCard({
  commit,
  context,
  onDone,
}: {
  commit: BlameCommit;
  context: BarContext;
  onDone: () => void;
}): ReactElement {
  const openTab = useOpenWorkspaceTab(context);
  const showChanges = useCallback(() => {
    openTab({ kind: "working_diff" });
    onDone();
  }, [onDone, openTab]);
  if (commit.uncommitted) {
    return (
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <Avatar name={null} large />
          <View style={styles.cardHeadText}>
            <Text style={styles.name}>{GROUPON_BLAME.you}</Text>
            <Text style={styles.muted}>{GROUPON_BLAME.notCommitted}</Text>
          </View>
        </View>
        <Text style={styles.cardTitle}>{GROUPON_BLAME.notCommittedNote}</Text>
        <View style={styles.actions}>
          <Button variant="ghost" size="sm" leftIcon={FileDiff} onPress={showChanges}>
            {GROUPON_BLAME.showChanges}
          </Button>
        </View>
      </View>
    );
  }
  return <CommittedCard commit={commit} context={context} onDone={onDone} />;
}

function CommittedCard({
  commit,
  context,
  onDone,
}: {
  commit: BlameCommit;
  context: BarContext;
  onDone: () => void;
}): ReactElement {
  const client = useHostRuntimeClient(context.serverId);
  const connected = useHostRuntimeIsConnected(context.serverId);
  const details = useFetchQuery({
    queryKey: ["groupon-git-details", context.serverId, context.directory, commit.sha],
    queryFn: async () => (client ? readGitDetails(client, context.directory, commit.sha) : []),
    enabled: Boolean(client) && connected,
    dataShape: "value",
    retry: false,
    staleTimeMs: DETAILS_STALE_MS,
  });
  const detail = details.data?.[0];
  const stat = useMemo(() => {
    if (!detail) return null;
    let additions = 0;
    let deletions = 0;
    for (const file of detail.files) {
      additions += file.additions ?? 0;
      deletions += file.deletions ?? 0;
    }
    return { files: detail.files.length + detail.moreFiles, additions, deletions };
  }, [detail]);
  const openTab = useOpenWorkspaceTab(context);
  const pullRequest = usePullRequestLink(context, commit);
  const showCommit = useCallback(() => {
    openTab({ kind: "commit_diff", sha: commit.sha });
    onDone();
  }, [commit.sha, onDone, openTab]);
  const openPullRequest = useCallback(() => {
    if (pullRequest?.url) void openExternalUrl(pullRequest.url);
    onDone();
  }, [onDone, pullRequest?.url]);
  const [copied, copy] = useCopied(commit.sha);
  const at = new Date(commit.at);
  return (
    <View style={styles.cardBody}>
      <View style={styles.cardHead}>
        <Avatar name={commit.author} large />
        <View style={styles.cardHeadText}>
          <Text style={styles.name} numberOfLines={1}>
            {commit.author}
          </Text>
          <Text style={styles.muted} numberOfLines={1}>
            {commit.email}
          </Text>
        </View>
      </View>
      <Text style={styles.cardTitle}>{commit.subject}</Text>
      {detail?.body ? (
        <Text style={styles.cardText} numberOfLines={4}>
          {detail.body}
        </Text>
      ) : null}
      <Text style={styles.cardText}>
        {at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} ·{" "}
        {formatAge(at.getTime())}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.sha} selectable>
          {commit.sha.slice(0, 9)}
        </Text>
        {stat ? (
          <>
            <Text style={styles.cardText}>{GROUPON_BLAME.files(stat.files)}</Text>
            <DiffStat additions={stat.additions} deletions={stat.deletions} />
          </>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" leftIcon={FileDiff} onPress={showCommit}>
          {GROUPON_BLAME.showCommit}
        </Button>
        {pullRequest?.url ? (
          <Button variant="ghost" size="sm" leftIcon={GitPullRequest} onPress={openPullRequest}>
            {pullRequest.label}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" leftIcon={copied ? Check : Copy} onPress={copy}>
          {copied ? GROUPON_BLAME.copied : GROUPON_BLAME.copySha}
        </Button>
      </View>
    </View>
  );
}

function AuthorsCard({
  authors,
  lineCount,
}: {
  authors: FileAuthor[];
  lineCount: number;
}): ReactElement {
  return (
    <View style={styles.cardBody}>
      <View>
        <Text style={styles.name}>{GROUPON_BLAME.authorsTitle}</Text>
        <Text style={styles.muted}>{GROUPON_BLAME.authorsNote(lineCount)}</Text>
      </View>
      {authors.map((author) => (
        <View key={author.name ?? ""} style={styles.authorRow}>
          <Avatar name={author.name} />
          <View style={styles.authorText}>
            <Text style={styles.cardText} numberOfLines={1}>
              {author.name ?? GROUPON_BLAME.notCommittedLines}
            </Text>
            <View style={styles.shareTrack}>
              <View style={[styles.shareFill, { width: `${Math.round(author.share * 100)}%` }]} />
            </View>
          </View>
          <Text style={styles.share}>{Math.round(author.share * 100)}%</Text>
        </View>
      ))}
    </View>
  );
}

function useOpenWorkspaceTab(context: BarContext): (target: WorkspaceTabTarget) => void {
  const openTab = useWorkspaceLayoutStore((state) => state.openTab);
  return useCallback(
    (target: WorkspaceTabTarget) => {
      const workspaceKey = buildWorkspaceTabPersistenceKey({
        serverId: context.serverId,
        workspaceId: context.workspaceId,
      });
      if (workspaceKey) {
        openTab({ workspaceKey, target, intent: "reveal", placement: FOCUSED_PANE_PLACEMENT });
      }
    },
    [context.serverId, context.workspaceId, openTab],
  );
}

/** The change request a commit names, with its page when the workspace's forge is known. */
function usePullRequestLink(
  context: BarContext,
  commit: BlameCommit,
): { label: string; url: string | null } | null {
  const number = commit.uncommitted ? null : changeRequestNumberOf(commit.subject);
  const { status } = useCheckoutStatusQuery({
    serverId: context.serverId,
    cwd: number === null ? "" : context.directory,
  });
  if (number === null) return null;
  const remoteUrl = status?.remoteUrl ?? null;
  const forge = forgeFromRemoteUrl(remoteUrl);
  const prefix = forge ? getForgePresentation(forge).numberPrefix : "#";
  return {
    label: GROUPON_BLAME.changeRequest(prefix, number),
    url: forge ? buildForgeChangeRequestUrl(forge, { remoteUrl, number }) : null,
  };
}

function useCopied(text: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = useCallback(() => {
    void (async () => {
      await copyToClipboard(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    })();
  }, [text]);
  return [copied, copy];
}

const styles = StyleSheet.create((theme) => ({
  bar: {
    flexShrink: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  lineSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
  },
  item: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[1.5],
    paddingVertical: theme.spacing[0.5],
    marginHorizontal: -theme.spacing[1.5],
    borderRadius: theme.borderRadius.base,
  },
  quiet: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  author: {
    flexShrink: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  muted: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  subject: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
  },
  chip: {
    flexShrink: 0,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: theme.spacing[1.5],
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  stack: {
    flexDirection: "row",
  },
  stacked: {
    marginLeft: -theme.spacing[1],
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLarge: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarYou: {
    backgroundColor: theme.colors.surface3,
  },
  avatarText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: theme.fontWeight.medium,
  },
  avatarTextLarge: {
    color: "#fff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  card: {
    width: CARD_WIDTH,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  authorsCard: {
    width: AUTHORS_CARD_WIDTH,
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  cardBody: {
    gap: theme.spacing[2],
    padding: theme.spacing[3],
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  cardHeadText: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  cardText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  sha: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderAccent,
  },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  authorText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  shareTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  shareFill: {
    height: "100%",
    backgroundColor: theme.colors.accentBright,
  },
  share: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
}));
