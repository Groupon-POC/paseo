// Added for Groupon Desk (fork of Paseo, Apache-2.0): a project's Encore card on its Projects page.

/**
 * The Encore card of a repository whose `.groupon/desk.toml` names Encore apps or release trains:
 * one card per app (its name, the person's standing, each environment's latest rollout with a link
 * to its page on Encore Cloud, and "Ask for access" when the person is not a member or nobody
 * could say), and the open release train with its checks. The Groupon plugin on the Mac reads it
 * (`groupon.encore-state`) and files the request (`groupon.encore-request-access`, the same
 * request the admin's /encore-onboarding page files). Read when the page opens and every minute
 * while it is open; nothing shows for a repository whose file names neither.
 */

import { ExternalLink, RefreshCw } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsGroup } from "@/components/settings/headings/settings-group";
import { Button } from "@/components/ui/button";
import { useFetchQuery } from "@/data/query";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  pluginProblemText,
  readEncoreState,
  requestEncoreAccess,
  type EncoreAppState,
  type EncoreStateAnswer,
  type PluginRpcClient,
  type ReleaseTrain,
} from "./desk-plugin-rpc";
import {
  accessOffer,
  checksText,
  ENCORE_REFRESH_MS,
  trainTone,
  rolloutLine,
  rolloutTone,
  standingText,
} from "./encore-state-model";
import { GROUPON_ENCORE } from "./strings";

interface SectionProps {
  client: PluginRpcClient | null;
  serverId: string;
  repoRoot: string;
}

export function EncoreStateSection({ client, serverId, repoRoot }: SectionProps) {
  const query = useFetchQuery({
    queryKey: ["groupon-encore-state", serverId, repoRoot],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readEncoreState(client, repoRoot);
    },
    enabled: Boolean(client && repoRoot),
    dataShape: "value",
    retry: false,
    staleTimeMs: 0,
    refetchInterval: ENCORE_REFRESH_MS,
  });
  const refetch = query.refetch;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const fetching = query.isFetching;
  const refreshButton = useMemo(
    () => (
      <Button variant="ghost" size="sm" leftIcon={RefreshCw} onPress={refresh} loading={fetching}>
        {GROUPON_ENCORE.refresh}
      </Button>
    ),
    [refresh, fetching],
  );
  const answer = query.data;
  if (query.error && !answer) {
    return (
      <SettingsGroup title={GROUPON_ENCORE.title} testID="groupon-encore-card">
        <Text style={styles.problem}>{pluginProblemText(query.error)}</Text>
      </SettingsGroup>
    );
  }
  if (!answer?.configured) return null;
  return (
    <SettingsGroup
      title={GROUPON_ENCORE.title}
      testID="groupon-encore-card"
      trailing={refreshButton}
    >
      <Text style={styles.caption}>
        {GROUPON_ENCORE.caption}
        {answer.environment ? ` ${GROUPON_ENCORE.environmentNote} ${answer.environment}.` : ""}
      </Text>
      {answer.appsProblem ? <Text style={styles.problem}>{answer.appsProblem}</Text> : null}
      {answer.apps.map((app) => (
        <EncoreAppCard key={app.slug} app={app} client={client} onRequested={refresh} />
      ))}
      <TrainRow answer={answer} />
      {answer.fileProblems.length > 0 ? (
        <View style={styles.fileProblems}>
          <Text style={styles.problem}>{GROUPON_ENCORE.fileProblems}</Text>
          {answer.fileProblems.map((problem) => (
            <Text key={problem} style={styles.problem}>
              {problem}
            </Text>
          ))}
        </View>
      ) : null}
    </SettingsGroup>
  );
}

function LinkButton({ url, label, testID }: { url: string; label: string; testID?: string }) {
  const open = useCallback(() => {
    void openExternalUrl(url);
  }, [url]);
  return (
    <Button variant="ghost" size="sm" leftIcon={ExternalLink} onPress={open} testID={testID}>
      {label}
    </Button>
  );
}

type Ask =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "answered"; text: string; failed: boolean };

function EncoreAppCard({
  app,
  client,
  onRequested,
}: {
  app: EncoreAppState;
  client: PluginRpcClient | null;
  onRequested: () => void;
}) {
  const [ask, setAsk] = useState<Ask>({ status: "idle" });
  const offer = accessOffer(app);
  const slug = app.slug;
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
    <View style={[settingsStyles.card, styles.appCard]} testID={`groupon-encore-app-${app.slug}`}>
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>
            {app.name} <Text style={styles.slug}>{app.slug}</Text>
          </Text>
          <Text style={settingsStyles.rowHint}>{standingText(app)}</Text>
        </View>
      </View>
      {app.environments.map(({ environment, rollout }) => (
        <View key={environment} style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <View style={settingsStyles.rowContent}>
            <Text style={settingsStyles.rowTitle}>{environment}</Text>
            <Text style={toneStyle(rolloutTone(rollout))} selectable>
              {rolloutLine(rollout)}
            </Text>
          </View>
          {rollout ? (
            <LinkButton
              url={rollout.dashboardUrl}
              label={GROUPON_ENCORE.openRollout}
              testID={`groupon-encore-rollout-${app.slug}-${environment}`}
            />
          ) : null}
        </View>
      ))}
      {offer !== "none" && ask.status !== "answered" ? (
        <View style={[settingsStyles.row, settingsStyles.rowBorder, styles.askRow]}>
          <Text style={styles.caption}>
            {offer === "ask-unknown" ? GROUPON_ENCORE.askUnknownHint : GROUPON_ENCORE.askHint}
          </Text>
          <Button
            variant="outline"
            size="sm"
            onPress={pressAsk}
            loading={ask.status === "sending"}
            disabled={!client || ask.status === "sending"}
            testID={`groupon-encore-ask-${app.slug}`}
          >
            {GROUPON_ENCORE.askForAccess}
          </Button>
        </View>
      ) : null}
      {ask.status === "answered" ? (
        <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
          <Text style={ask.failed ? styles.problem : styles.caption}>{ask.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TrainRow({ answer }: { answer: EncoreStateAnswer }) {
  if (!answer.releases) return null;
  const train: ReleaseTrain | null = answer.train;
  return (
    <View style={[settingsStyles.card, styles.appCard]} testID="groupon-encore-train">
      <View style={settingsStyles.row}>
        <View style={settingsStyles.rowContent}>
          <Text style={settingsStyles.rowTitle}>{GROUPON_ENCORE.trainTitle}</Text>
          {train ? (
            <Text style={toneStyle(trainTone(train))} selectable>
              #{train.number} {train.title} · {checksText(train)}
            </Text>
          ) : (
            <Text style={settingsStyles.rowHint}>
              {answer.trainProblem ??
                `${GROUPON_ENCORE.noTrain} (${GROUPON_ENCORE.trainInto} ${answer.releases.base})`}
            </Text>
          )}
        </View>
        {train ? <LinkButton url={train.url} label={`#${train.number}`} /> : null}
      </View>
    </View>
  );
}

function toneStyle(tone: "good" | "bad" | "neutral") {
  if (tone === "good") return styles.good;
  if (tone === "bad") return styles.bad;
  return settingsStyles.rowHint;
}

const styles = StyleSheet.create((theme) => ({
  caption: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[2],
  },
  problem: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[1],
  },
  slug: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: "normal",
  },
  appCard: {
    marginBottom: theme.spacing[3],
  },
  askRow: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  good: {
    color: theme.colors.statusSuccess,
    fontSize: theme.fontSize.sm,
  },
  bad: {
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  fileProblems: {
    marginTop: theme.spacing[2],
  },
}));
