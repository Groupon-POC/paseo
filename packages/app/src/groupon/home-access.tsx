// Added for Groupon Desk (fork of Paseo, Apache-2.0): Your access on the home page, the Encore apps and the GitHub organisations you are in.

/**
 * Two cards beside the home page's tiles, read by the Groupon plugin on one of the person's Macs
 * (the one this window runs beside, else the first) with the CLI's own session there:
 *
 * - Encore apps: every app the platform hands out (`groupon.encore-apps`), the ones you are in
 *   first, each with your standing, and "Ask for access" for one you are not in, which files the
 *   same request as the Projects page's Encore card (`groupon.encore-request-access`).
 * - GitHub: per host (github.com, then Groupon's GitHub Enterprise) the organisations and teams
 *   you are in (`groupon.github-access`, the same read From GitHub uses), the command that signs
 *   gh in where it is not, and where to ask for access when the platform names a page for it.
 *
 * Both read when the page opens and every minute while it is open; a failed read is one line.
 */

import { useQueryClient } from "@tanstack/react-query";
import { Boxes, ExternalLink, RefreshCw } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitHubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { openExternalUrl } from "@/utils/open-external-url";
import { CopyLine } from "./copy-line";
import {
  pluginProblemText,
  readEncoreApps,
  readGithubAccess,
  requestEncoreAccess,
  type PluginRpcClient,
} from "./desk-plugin-rpc";
import {
  ACCESS_GITHUB_HOSTS,
  ACCESS_REFRESH_MS,
  accessServerIdOf,
  encoreAccessRows,
  encoreCountText,
  githubHostCard,
  githubHostTitle,
  type EncoreAccessRow,
  type GithubHostCard,
} from "./home-access-model";
import { GROUPON_ACCESS, GROUPON_ENCORE } from "./strings";

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedGitHub = withUnistyles(GitHubIcon);
const ThemedBoxes = withUnistyles(Boxes);

/** The two cards, read on one of the person's Macs; nothing to read without one. */
export function HomeAccess() {
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const serverId = accessServerIdOf(localServerId, hosts);
  const client = useHostRuntimeClient(serverId ?? "");
  const label = hosts.find((host) => host.serverId === serverId)?.label ?? serverId;
  return (
    <View style={styles.column} testID="groupon-home-access">
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{GROUPON_ACCESS.title}</Text>
        {label ? (
          <Text style={styles.readOn} numberOfLines={1}>
            {GROUPON_ACCESS.readOn} {label}
          </Text>
        ) : null}
      </View>
      {serverId ? (
        <>
          <EncoreAccessCard client={client} serverId={serverId} />
          <GithubAccessCard client={client} serverId={serverId} />
        </>
      ) : (
        <View style={styles.card}>
          <Text style={styles.problem}>{GROUPON_ACCESS.notConnected}</Text>
        </View>
      )}
    </View>
  );
}

interface CardProps {
  client: PluginRpcClient | null;
  serverId: string;
}

function CardHeading({
  icon,
  title,
  caption,
  onRefresh,
  refreshing,
  testID,
}: {
  icon: "encore" | "github";
  title: string;
  caption: string;
  onRefresh: () => void;
  refreshing: boolean;
  testID: string;
}) {
  return (
    <View style={styles.cardHeading}>
      {icon === "github" ? (
        <ThemedGitHub size={16} uniProps={mutedMapping} />
      ) : (
        <ThemedBoxes size={16} uniProps={mutedMapping} />
      )}
      <View style={styles.cardHeadingText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <Button
        variant="ghost"
        size="sm"
        leftIcon={RefreshCw}
        onPress={onRefresh}
        loading={refreshing}
        accessibilityLabel={GROUPON_ACCESS.refresh}
        testID={testID}
      />
    </View>
  );
}

function EncoreAccessCard({ client, serverId }: CardProps) {
  const query = useFetchQuery({
    queryKey: ["groupon-encore-apps", serverId],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readEncoreApps(client);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 0,
    refetchInterval: ACCESS_REFRESH_MS,
  });
  const refetch = query.refetch;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const answer = query.data;
  const count = answer ? encoreCountText(answer) : null;
  const rows = answer ? encoreAccessRows(answer) : [];
  return (
    <View style={styles.card} testID="groupon-home-encore">
      <CardHeading
        icon="encore"
        title={GROUPON_ACCESS.encoreTitle}
        caption={count ?? GROUPON_ACCESS.encoreCaption}
        onRefresh={refresh}
        refreshing={query.isFetching}
        testID="groupon-home-encore-refresh"
      />
      {query.error ? (
        <Text style={styles.problem} numberOfLines={2}>
          {pluginProblemText(query.error)}
        </Text>
      ) : null}
      {answer?.problem ? (
        <Text style={styles.problem} numberOfLines={2}>
          {answer.problem}
        </Text>
      ) : null}
      {answer && rows.length === 0 && !answer.problem ? (
        <Text style={styles.caption}>{GROUPON_ACCESS.encoreEmpty}</Text>
      ) : null}
      {rows.map((row) => (
        <EncoreAccessLine key={row.slug} row={row} client={client} onRequested={refresh} />
      ))}
    </View>
  );
}

type Ask =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "answered"; text: string; failed: boolean };

function EncoreAccessLine({
  row,
  client,
  onRequested,
}: {
  row: EncoreAccessRow;
  client: PluginRpcClient | null;
  onRequested: () => void;
}) {
  const [ask, setAsk] = useState<Ask>({ status: "idle" });
  const slug = row.slug;
  const askForAccess = useCallback(async () => {
    if (!client) return;
    setAsk({ status: "sending" });
    try {
      const answer = await requestEncoreAccess(client, slug);
      const text = answer.state === "filed" ? GROUPON_ENCORE.filed : answer.message;
      setAsk({ status: "answered", text, failed: answer.state === "failed" });
      if (answer.state !== "failed") onRequested();
    } catch (error) {
      setAsk({ status: "answered", text: pluginProblemText(error), failed: true });
    }
  }, [client, slug, onRequested]);
  const pressAsk = useCallback(() => {
    void askForAccess();
  }, [askForAccess]);
  return (
    <View style={styles.line} testID={`groupon-home-encore-${row.slug}`}>
      <View style={styles.lineMain}>
        <View style={styles.lineText}>
          <Text style={styles.lineTitle} numberOfLines={1}>
            {row.title} <Text style={styles.lineSlug}>{row.slug}</Text>
          </Text>
          <Text style={row.tone === "good" ? styles.good : styles.lineHint}>{row.standing}</Text>
        </View>
        {row.offer !== "none" && ask.status !== "answered" ? (
          <Button
            variant="outline"
            size="sm"
            onPress={pressAsk}
            loading={ask.status === "sending"}
            disabled={!client || ask.status === "sending"}
            testID={`groupon-home-encore-ask-${row.slug}`}
          >
            {GROUPON_ENCORE.askForAccess}
          </Button>
        ) : null}
      </View>
      {ask.status === "answered" ? (
        <Text style={ask.failed ? styles.problem : styles.lineHint}>{ask.text}</Text>
      ) : null}
    </View>
  );
}

function GithubAccessCard({ client, serverId }: CardProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useCallback(async () => {
    if (!client) return;
    setRefreshing(true);
    try {
      await Promise.all(
        ACCESS_GITHUB_HOSTS.map(async (host) => {
          const key = ["groupon-github-access", serverId, host];
          try {
            queryClient.setQueryData(key, await readGithubAccess(client, host, true));
          } catch {
            await queryClient.invalidateQueries({ queryKey: key });
          }
        }),
      );
    } finally {
      setRefreshing(false);
    }
  }, [client, queryClient, serverId]);
  const pressRefresh = useCallback(() => {
    void refresh();
  }, [refresh]);
  return (
    <View style={styles.card} testID="groupon-home-github">
      <CardHeading
        icon="github"
        title={GROUPON_ACCESS.githubTitle}
        caption={GROUPON_ACCESS.githubCaption}
        onRefresh={pressRefresh}
        refreshing={refreshing}
        testID="groupon-home-github-refresh"
      />
      {ACCESS_GITHUB_HOSTS.map((host) => (
        <GithubHostSection key={host} client={client} serverId={serverId} host={host} />
      ))}
    </View>
  );
}

function GithubHostSection({ client, serverId, host }: CardProps & { host: string }) {
  // The same key as From GitHub's sheet, so the two share one read of each host.
  const query = useFetchQuery({
    queryKey: ["groupon-github-access", serverId, host],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readGithubAccess(client, host, false);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 0,
    refetchInterval: ACCESS_REFRESH_MS,
  });
  const card: GithubHostCard | null = query.data ? githubHostCard(host, query.data) : null;
  return (
    <View style={styles.line} testID={`groupon-home-github-${host}`}>
      <Text style={styles.hostTitle}>
        {githubHostTitle(host)}
        {card?.kind === "access" && card.login ? (
          <Text style={styles.lineSlug}>
            {" "}
            · {GROUPON_ACCESS.signedInAs} {card.login}
          </Text>
        ) : null}
        {card?.kind === "signed-out" ? (
          <Text style={styles.lineSlug}> · {GROUPON_ACCESS.notSignedIn}</Text>
        ) : null}
      </Text>
      {query.error ? (
        <Text style={styles.problem} numberOfLines={2}>
          {pluginProblemText(query.error)}
        </Text>
      ) : null}
      {card ? <GithubHostBody card={card} /> : null}
    </View>
  );
}

function GithubHostBody({ card }: { card: GithubHostCard }) {
  const askUrl = card.kind === "access" ? card.askUrl : null;
  const openAsk = useCallback(() => {
    if (askUrl) void openExternalUrl(askUrl);
  }, [askUrl]);
  if (card.kind === "signed-out") {
    return (
      <View style={styles.signIn}>
        <Text style={styles.lineHint}>{GROUPON_ACCESS.signInHint}</Text>
        <CopyLine
          text={card.signIn}
          accessibilityLabel={GROUPON_ACCESS.signInLabel}
          testID={`groupon-home-github-signin-${card.host}`}
        />
      </View>
    );
  }
  if (card.kind === "problem") {
    return (
      <Text style={styles.problem} numberOfLines={2}>
        {card.problem}
      </Text>
    );
  }
  return (
    <View>
      {card.organisations.length === 0 ? (
        <Text style={styles.lineHint}>{GROUPON_ACCESS.noOrganisation}</Text>
      ) : null}
      {card.organisations.map((organisation) => (
        <View key={organisation.login} style={styles.organisation}>
          <Text
            style={organisation.member ? styles.organisationName : styles.organisationOut}
            numberOfLines={1}
          >
            {organisation.login}
          </Text>
          <Text style={styles.organisationTeams} numberOfLines={2}>
            {organisation.detail}
          </Text>
        </View>
      ))}
      {card.others !== null && card.others > 0 ? (
        <Text style={styles.lineHint}>{GROUPON_ACCESS.otherOrganisations(card.others)}</Text>
      ) : null}
      {askUrl ? (
        <View style={styles.askRow}>
          <Text style={styles.lineHint}>{GROUPON_ACCESS.askWhere}</Text>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={ExternalLink}
            onPress={openAsk}
            testID="groupon-home-github-ask"
          >
            {GROUPON_ACCESS.askWhereLink}
          </Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  column: {
    width: "100%",
    maxWidth: { xs: 452, md: 400 },
    gap: theme.spacing[3],
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  heading: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  readOn: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: 12,
  },
  card: {
    padding: theme.spacing[4],
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    gap: theme.spacing[3],
  },
  cardHeading: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  cardHeadingText: {
    flex: 1,
    gap: theme.spacing[1],
  },
  cardTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  caption: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  problem: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
  },
  line: {
    gap: theme.spacing[1],
    paddingTop: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  lineMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  lineText: {
    flex: 1,
    gap: 2,
  },
  lineTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  lineSlug: {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
    fontWeight: theme.fontWeight.normal,
  },
  lineHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  good: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.sm,
  },
  hostTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  signIn: {
    gap: theme.spacing[2],
  },
  organisation: {
    flexDirection: "row",
    gap: theme.spacing[2],
    paddingVertical: 2,
  },
  organisationName: {
    width: 150,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  organisationOut: {
    width: 150,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  organisationTeams: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  askRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
}));
