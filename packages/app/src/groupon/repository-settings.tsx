// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Projects page from the repository's .groupon/desk.toml, with its Encore card.

/**
 * The Projects page of a repository that carries `.groupon/desk.toml`: every field filled from the
 * default branch's copy (the Groupon plugin on the Mac reads it with git, `groupon.project-settings`)
 * and read-only, with the file's link; Branch names is the company standard (`groupon ticket name`).
 * Paseo's own editable page stays, collapsed, as "Override on this Mac": it writes the work window's
 * sections of this checkout's `.groupon/desk.toml`, which apply on this Mac only until a pull request
 * lands them, and each value it changes is marked as an override.
 * A repository without the file, or a daemon without the plugin, keeps Paseo's page as it is.
 * Under the values, the Encore card (`encore-state-section.tsx`) when the file names Encore apps
 * or release trains. Above them, with the file or without, Improve this repository for this checkout
 * (`improve-repository-sheet.tsx`); the file's `[prompts] improve_repository` shows among the values.
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";
import { ChevronDown, ChevronRight, ExternalLink, WandSparkles } from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SettingsGroup } from "@/components/settings/headings/settings-group";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";
import { EncoreStateSection } from "./encore-state-section";
import { IMPROVE_PROMPT_KEY } from "./improve-repository-model";
import { useImproveRepositoryStore } from "./improve-repository-store";
import {
  readProjectSettings,
  type PluginRpcClient,
  type ProjectSettingsAnswer,
} from "./desk-plugin-rpc";
import {
  hasOverrides,
  overridesOf,
  standardCaption,
  type LocalOverrides,
} from "./repository-settings-model";
import { GROUPON_IMPROVE, GROUPON_REPOSITORY } from "./strings";

/** The repository's committed standard, read by the Groupon plugin on the Mac; undefined while it loads. */
export function useRepositoryStandard(
  client: PluginRpcClient | null,
  serverId: string,
  repoRoot: string,
): { answer: ProjectSettingsAnswer | undefined; settled: boolean } {
  const query = useFetchQuery({
    queryKey: ["groupon-project-settings", serverId, repoRoot],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readProjectSettings(client, repoRoot, false);
    },
    enabled: Boolean(client && repoRoot),
    dataShape: "value",
    retry: false,
    staleTimeMs: 60_000,
  });
  return { answer: query.data, settled: !query.isLoading };
}

interface GateProps {
  client: DaemonClient;
  serverId: string;
  repoRoot: string;
  /** The work window's sections of this checkout's `.groupon/desk.toml`, as the daemon read them. */
  localConfig: PaseoConfigRaw | null;
  /** Paseo's own editable page for this checkout. */
  children: ReactNode;
}

/** The repository's values when it has the file, Paseo's page when it has not. */
export function RepositoryStandardGate({
  client,
  serverId,
  repoRoot,
  localConfig,
  children,
}: GateProps) {
  const { answer, settled } = useRepositoryStandard(client, serverId, repoRoot);
  if (!settled) {
    return (
      <View style={styles.centered}>
        <LoadingSpinner color={styles.spinner.color} />
      </View>
    );
  }
  if (!answer?.settings) {
    return (
      <View>
        <ImproveThisRepository serverId={serverId} repoRoot={repoRoot} />
        {children}
      </View>
    );
  }
  return (
    <View>
      <ImproveThisRepository serverId={serverId} repoRoot={repoRoot} />
      <RepositorySettingsPanel answer={answer} overrides={overridesOf(localConfig)} />
      <EncoreStateSection client={client} serverId={serverId} repoRoot={repoRoot} />
      <OverrideOnThisMac>{children}</OverrideOnThisMac>
    </View>
  );
}

/** Opens Improve this repository on this checkout. */
function ImproveThisRepository({ serverId, repoRoot }: { serverId: string; repoRoot: string }) {
  const open = useImproveRepositoryStore((state) => state.open);
  const handlePress = useCallback(
    () => open({ serverId, path: repoRoot }),
    [open, repoRoot, serverId],
  );
  return (
    <View style={styles.improve}>
      <Button
        variant="outline"
        size="sm"
        leftIcon={WandSparkles}
        onPress={handlePress}
        testID="groupon-repository-improve"
      >
        {GROUPON_IMPROVE.title}
      </Button>
    </View>
  );
}

function ReadOnlyValue({ value, testID }: { value: string; testID: string }) {
  return (
    <View style={settingsStyles.card}>
      <Text style={styles.value} selectable testID={testID}>
        {value}
      </Text>
    </View>
  );
}

function OverrideNote({ value }: { value: string | null }) {
  if (value === null) return null;
  return (
    <Text style={styles.override} selectable>
      {GROUPON_REPOSITORY.overridden} {value}
    </Text>
  );
}

function RepositorySettingsPanel({
  answer,
  overrides,
}: {
  answer: ProjectSettingsAnswer;
  overrides: LocalOverrides;
}) {
  const settings = answer.settings;
  const fileUrl = answer.fileUrl;
  const openFile = useCallback(() => {
    if (fileUrl) void openExternalUrl(fileUrl);
  }, [fileUrl]);
  const overriddenScripts = useMemo(
    () => new Map(overrides.scripts.map((script) => [script.id, script.command])),
    [overrides.scripts],
  );
  if (!settings) return null;
  const extraScripts = overrides.scripts.filter(
    (script) => !settings.run.some((run) => run.id === script.id),
  );
  return (
    <View testID="groupon-repository-settings">
      <View style={styles.caption}>
        <Text style={styles.captionText}>{standardCaption(answer)}</Text>
        {fileUrl ? (
          <Button variant="ghost" size="sm" leftIcon={ExternalLink} onPress={openFile}>
            {GROUPON_REPOSITORY.openFile}
          </Button>
        ) : null}
      </View>
      {answer.problem ? <Text style={styles.problem}>{answer.problem}</Text> : null}
      {hasOverrides(overrides) ? (
        <Text style={styles.overrideBanner}>{GROUPON_REPOSITORY.overridesPresent}</Text>
      ) : null}

      <SettingsGroup title={GROUPON_REPOSITORY.lifecycleTitle} testID="groupon-worktree-group">
        <SettingsSection title={GROUPON_REPOSITORY.setup}>
          <ReadOnlyValue value={settings.setup ?? GROUPON_REPOSITORY.none} testID="groupon-setup" />
          <OverrideNote value={overrides.setup} />
        </SettingsSection>
        <SettingsSection title={GROUPON_REPOSITORY.teardown} flush>
          <ReadOnlyValue
            value={settings.archive ?? GROUPON_REPOSITORY.none}
            testID="groupon-teardown"
          />
          <OverrideNote value={overrides.teardown} />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup title={GROUPON_REPOSITORY.scriptsTitle} testID="groupon-scripts-group">
        <View style={settingsStyles.card}>
          {settings.run.length === 0 ? (
            <View style={settingsStyles.row}>
              <Text style={settingsStyles.rowHint}>{GROUPON_REPOSITORY.noScripts}</Text>
            </View>
          ) : null}
          {settings.run.map((script, index) => (
            <View
              key={script.id}
              style={
                index === 0 ? settingsStyles.row : [settingsStyles.row, settingsStyles.rowBorder]
              }
            >
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>
                  {script.id}
                  {script.isDefault ? ` · ${GROUPON_REPOSITORY.defaultScript}` : ""}
                </Text>
                <Text style={settingsStyles.rowHint} selectable>
                  {script.command}
                </Text>
                <OverrideNote value={overriddenScripts.get(script.id) ?? null} />
              </View>
            </View>
          ))}
          {extraScripts.map((script) => (
            <View key={script.id} style={[settingsStyles.row, settingsStyles.rowBorder]}>
              <View style={settingsStyles.rowContent}>
                <Text style={settingsStyles.rowTitle}>{script.id}</Text>
                <OverrideNote value={script.command} />
              </View>
            </View>
          ))}
        </View>
      </SettingsGroup>

      <SettingsGroup title={GROUPON_REPOSITORY.metadataTitle} testID="groupon-metadata-group">
        <SettingsSection title={GROUPON_REPOSITORY.branchNames}>
          <ReadOnlyValue
            value={GROUPON_REPOSITORY.branchNamesStandard}
            testID="groupon-branch-names"
          />
          <OverrideNote value={overrides.branchNames} />
        </SettingsSection>
        <SettingsSection title={GROUPON_REPOSITORY.commitMessages}>
          <ReadOnlyValue
            value={settings.prompts.commit_messages ?? GROUPON_REPOSITORY.notSet}
            testID="groupon-commit-messages"
          />
          <OverrideNote value={overrides.commitMessages} />
        </SettingsSection>
        <SettingsSection title={GROUPON_REPOSITORY.pullRequests}>
          <ReadOnlyValue
            value={settings.prompts.create_pr ?? GROUPON_REPOSITORY.notSet}
            testID="groupon-pull-requests"
          />
          <OverrideNote value={overrides.pullRequests} />
        </SettingsSection>
        <SettingsSection title={GROUPON_IMPROVE.title} flush>
          <ReadOnlyValue
            value={settings.prompts[IMPROVE_PROMPT_KEY] ?? GROUPON_REPOSITORY.improveDefault}
            testID="groupon-improve-prompt-value"
          />
        </SettingsSection>
      </SettingsGroup>

      <SettingsGroup title={GROUPON_REPOSITORY.gitTitle} testID="groupon-git-group">
        <View style={settingsStyles.card}>
          <View style={settingsStyles.row}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{GROUPON_REPOSITORY.targetBranch}</Text>
              <Text style={settingsStyles.rowHint}>
                {settings.targetBranch ?? answer.branch ?? GROUPON_REPOSITORY.notSet}
              </Text>
            </View>
          </View>
          <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
            <View style={settingsStyles.rowContent}>
              <Text style={settingsStyles.rowTitle}>{GROUPON_REPOSITORY.envRequired}</Text>
              <Text style={settingsStyles.rowHint}>
                {settings.envRequired.length > 0
                  ? settings.envRequired.join(", ")
                  : GROUPON_REPOSITORY.none}
              </Text>
            </View>
          </View>
        </View>
      </SettingsGroup>
    </View>
  );
}

function OverrideOnThisMac({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  return (
    <View style={styles.overrideBlock} testID="groupon-override-on-this-mac">
      <View style={styles.overrideHeader}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={open ? ChevronDown : ChevronRight}
          onPress={toggle}
        >
          {GROUPON_REPOSITORY.overrideTitle}
        </Button>
      </View>
      <Text style={styles.captionText}>{GROUPON_REPOSITORY.overrideHint}</Text>
      {open ? <View style={styles.overrideBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  centered: {
    alignItems: "center",
    paddingVertical: theme.spacing[8],
  },
  spinner: {
    color: theme.colors.foregroundMuted,
  },
  caption: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  captionText: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  problem: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[2],
  },
  value: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  override: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
  overrideBanner: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing[4],
  },
  overrideBlock: {
    marginTop: theme.spacing[6],
    gap: theme.spacing[2],
  },
  overrideHeader: {
    flexDirection: "row",
  },
  overrideBody: {
    marginTop: theme.spacing[2],
  },
  improve: {
    flexDirection: "row",
    marginBottom: theme.spacing[4],
  },
}));
