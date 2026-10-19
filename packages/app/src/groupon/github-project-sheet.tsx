// Added for Groupon Desk (fork of Paseo, Apache-2.0): Add a project, From GitHub, with Groupon's organisations and teams.

/**
 * The person's organisations and teams as the platform sees them (the internal plane's GitHub
 * overview and each team's repositories, read by the Groupon plugin on the chosen Mac with the
 * CLI's session there), then a repository, then the folder: the plugin downloads it the way the
 * CLI does (`gh repo clone`, git over https without gh) and this registers it as a project with
 * Paseo's own `project.add`, then opens New workspace on it.
 */

import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronRight, Folder, RefreshCw, Users } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { GitHubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { EditingTextInput } from "@/components/ui/text-input";
import { useFetchQuery } from "@/data/query";
import { useOpenProject } from "@/hooks/use-open-project";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { openExternalUrl } from "@/utils/open-external-url";
import {
  followJob,
  pluginProblemText,
  readGithubAccess,
  startGithubClone,
  type GithubAccessAnswer,
  type GithubRepository,
} from "./desk-plugin-rpc";
import {
  ALL_TEAMS,
  checkoutPathPreview,
  folderProblem,
  matching,
  organisationHint,
  organisationOf,
  organisationsOf,
  previousStep,
  repositoriesOf,
  repositoryHint,
  stepTitle,
  teamHint,
  type GithubStep,
} from "./github-project-model";
import { useGithubProjectStore } from "./github-project-store";
import { GROUPON_GITHUB } from "./strings";

const SNAP_POINTS = ["75%", "92%"];

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedGitHub = withUnistyles(GitHubIcon);
const ThemedUsers = withUnistyles(Users);
const ThemedFolder = withUnistyles(Folder);
const ThemedChevron = withUnistyles(ChevronRight);
const ThemedSpinner = withUnistyles(LoadingSpinner, (theme) => ({
  color: theme.colors.foregroundMuted,
}));

type Download =
  | { status: "idle" }
  | { status: "running"; phase: string }
  | { status: "failed"; error: string };

/** Mounted once beside Paseo's Add project flow; draws the sheet while a request is open. */
export function GithubProjectSheetHost() {
  const request = useGithubProjectStore((state) => state.request);
  const close = useGithubProjectStore((state) => state.close);
  if (!request) return null;
  return <GithubProjectSheet key={request.id} serverId={request.serverId} onClose={close} />;
}

interface RowProps {
  id: string;
  title: string;
  subtitle: string;
  icon: "org" | "team" | "repo";
  disabled?: boolean;
  onSelect: (id: string) => void;
  testID: string;
}

function RowIcon({ icon }: { icon: RowProps["icon"] }) {
  if (icon === "repo") return <ThemedGitHub size={16} uniProps={mutedMapping} />;
  if (icon === "team") return <ThemedUsers size={16} uniProps={mutedMapping} />;
  return <ThemedFolder size={16} uniProps={mutedMapping} />;
}

function Row({ id, title, subtitle, icon, disabled, onSelect, testID }: RowProps) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <PressHighlight
      style={styles.row}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      <RowIcon icon={icon} />
      <View style={styles.rowText}>
        <Text style={disabled ? styles.rowTitleMuted : styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {disabled ? null : <ThemedChevron size={14} uniProps={mutedMapping} />}
    </PressHighlight>
  );
}

function GithubProjectSheet({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const client = useHostRuntimeClient(serverId);
  const hostLabel = useHosts().find((host) => host.serverId === serverId)?.label ?? serverId;
  const openProject = useOpenProject(serverId);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<GithubStep>({ kind: "organisations" });
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [download, setDownload] = useState<Download>({ status: "idle" });
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const queryKey = useMemo(() => ["groupon-github-access", serverId], [serverId]);
  const access = useFetchQuery({
    queryKey,
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readGithubAccess(client, false);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 60_000,
  });
  const answer = access.data ?? null;
  const shownFolder = folder ?? answer?.defaultFolder ?? "~/Documents/GitHub";

  const refresh = useCallback(async () => {
    if (!client) return;
    queryClient.setQueryData(queryKey, await readGithubAccess(client, true));
  }, [client, queryClient, queryKey]);

  const go = useCallback((next: GithubStep) => {
    setQuery("");
    setStep(next);
  }, []);

  const back = useCallback(() => {
    if (download.status === "running") return;
    const previous = previousStep(step);
    if (previous) go(previous);
    else onClose();
  }, [download.status, go, onClose, step]);

  const startDownload = useCallback(
    async (repository: GithubRepository) => {
      if (!client || download.status === "running") return;
      const problem = folderProblem(shownFolder);
      if (problem) {
        setDownload({ status: "failed", error: problem });
        return;
      }
      setDownload({ status: "running", phase: `Downloading ${repository.fullName}` });
      try {
        const jobId = await startGithubClone(client, repository.fullName, shownFolder);
        const job = await followJob(
          client,
          jobId,
          (next) => setDownload({ status: "running", phase: next.phase }),
          () => live.current,
        );
        if (!job) return;
        if (job.status === "failed" || !job.clone) {
          setDownload({ status: "failed", error: job.error ?? "The download did not finish." });
          return;
        }
        const checkoutPath = job.clone.checkoutPath;
        setDownload({ status: "running", phase: `Adding ${checkoutPath} as a project` });
        const added = await openProject(checkoutPath);
        if (!added.ok) {
          setDownload({
            status: "failed",
            error: added.error ?? `Downloaded to ${checkoutPath}, but it could not be added.`,
          });
          return;
        }
        onClose();
        router.push(
          buildNewWorkspaceRoute({
            serverId,
            projectId: added.project.projectId,
            sourceDirectory: added.project.projectRootPath,
            displayName: added.project.projectDisplayName,
          }),
        );
      } catch (error) {
        if (live.current) setDownload({ status: "failed", error: pluginProblemText(error) });
      }
    },
    [client, download.status, onClose, openProject, serverId, shownFolder],
  );

  const header = useMemo<SheetHeader>(() => {
    const base: SheetHeader = {
      title: stepTitle(step, GROUPON_GITHUB.title, GROUPON_GITHUB.allTeams),
      subtitle: `${GROUPON_GITHUB.downloadsTo} ${hostLabel}`,
    };
    if (step.kind !== "organisations") base.back = { onPress: back, label: "Back" };
    if (step.kind !== "folder") {
      base.search = {
        onChange: setQuery,
        resetKey: step.kind,
        placeholder: GROUPON_GITHUB.searchPlaceholder,
        testID: "groupon-github-search",
      };
    }
    return base;
  }, [back, hostLabel, step]);

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-github-sheet"
      desktopMaxWidth={560}
      snapPoints={SNAP_POINTS}
    >
      {access.isLoading ? <Waiting text={GROUPON_GITHUB.reading} /> : null}
      {access.error ? <Text style={styles.error}>{pluginProblemText(access.error)}</Text> : null}
      {answer?.problem ? <Text style={styles.error}>{answer.problem}</Text> : null}
      {answer ? (
        <StepBody
          step={step}
          answer={answer}
          query={query}
          folder={shownFolder}
          download={download}
          onFolder={setFolder}
          onGo={go}
          onDownload={startDownload}
          onRefresh={refresh}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <View style={styles.status}>
      <ThemedSpinner size={16} />
      <Text style={styles.muted}>{text}</Text>
    </View>
  );
}

interface StepBodyProps {
  step: GithubStep;
  answer: GithubAccessAnswer;
  query: string;
  folder: string;
  download: Download;
  onFolder: (folder: string) => void;
  onGo: (step: GithubStep) => void;
  onDownload: (repository: GithubRepository) => void;
  onRefresh: () => Promise<void>;
}

function StepBody(props: StepBodyProps) {
  const { step } = props;
  switch (step.kind) {
    case "organisations":
      return <OrganisationsStep {...props} />;
    case "teams":
      return <TeamsStep {...props} organisation={step.organisation} />;
    case "repositories":
      return <RepositoriesStep {...props} organisation={step.organisation} team={step.team} />;
    case "folder":
      return <FolderStep {...props} repository={step.repository} />;
    default: {
      const exhaustive: never = step;
      return exhaustive;
    }
  }
}

function OrganisationsStep({ answer, query, onGo, onRefresh }: StepBodyProps) {
  const organisations = matching(
    organisationsOf(answer),
    query,
    (org) => `${org.login} ${org.purpose}`,
  );
  const choose = useCallback(
    (login: string) => onGo({ kind: "teams", organisation: login }),
    [onGo],
  );
  const requestAccessUrl = answer.access?.requestAccessUrl ?? null;
  const askForAccess = useCallback(() => {
    if (requestAccessUrl) void openExternalUrl(requestAccessUrl);
  }, [requestAccessUrl]);
  const refresh = useCallback(() => {
    onRefresh().catch(() => {});
  }, [onRefresh]);
  return (
    <View style={styles.list}>
      {answer.access && !answer.access.githubLogin ? (
        <Text style={styles.muted}>{GROUPON_GITHUB.noLogin}</Text>
      ) : null}
      {answer.access && organisations.length === 0 ? (
        <Text style={styles.muted}>{GROUPON_GITHUB.noOrganisation}</Text>
      ) : null}
      {organisations.map((org) => (
        <Row
          key={org.login}
          id={org.login}
          icon="org"
          title={org.login}
          subtitle={organisationHint(org, GROUPON_GITHUB.notMember)}
          disabled={org.membership !== "member"}
          onSelect={choose}
          testID={`groupon-github-org-${org.login}`}
        />
      ))}
      <View style={styles.actions}>
        {requestAccessUrl ? (
          <Button variant="ghost" size="sm" onPress={askForAccess}>
            {GROUPON_GITHUB.askForAccess}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" leftIcon={RefreshCw} onPress={refresh}>
          {GROUPON_GITHUB.refresh}
        </Button>
      </View>
    </View>
  );
}

function TeamsStep({
  answer,
  query,
  onGo,
  organisation,
}: StepBodyProps & { organisation: string }) {
  const org = organisationOf(answer, organisation);
  const teams = matching(
    org?.teams ?? [],
    query,
    (team) => `${team.name} ${team.slug} ${team.description ?? ""}`,
  );
  const choose = useCallback(
    (team: string) => onGo({ kind: "repositories", organisation, team }),
    [onGo, organisation],
  );
  return (
    <View style={styles.list}>
      {teams.length === 0 ? <Text style={styles.muted}>{GROUPON_GITHUB.noTeam}</Text> : null}
      {(org?.teams.length ?? 0) > 1 && !query ? (
        <Row
          id={ALL_TEAMS}
          icon="team"
          title={GROUPON_GITHUB.allTeams}
          subtitle={GROUPON_GITHUB.allTeamsHint}
          onSelect={choose}
          testID="groupon-github-team-all"
        />
      ) : null}
      {teams.map((team) => (
        <Row
          key={team.slug}
          id={team.slug}
          icon="team"
          title={team.name}
          subtitle={teamHint(team, GROUPON_GITHUB.teamUnread)}
          onSelect={choose}
          testID={`groupon-github-team-${team.slug}`}
        />
      ))}
    </View>
  );
}

function RepositoriesStep({
  answer,
  query,
  onGo,
  organisation,
  team,
}: StepBodyProps & { organisation: string; team: string }) {
  const { repositories, unreadTeams } = repositoriesOf(organisationOf(answer, organisation), team);
  const shown = matching(repositories, query, (repo) => `${repo.name} ${repo.description ?? ""}`);
  const choose = useCallback(
    (fullName: string) => {
      const repository = repositories.find((repo) => repo.fullName === fullName);
      if (repository) onGo({ kind: "folder", organisation, team, repository });
    },
    [onGo, organisation, repositories, team],
  );
  return (
    <View style={styles.list}>
      {unreadTeams.length > 0 ? (
        <Text style={styles.muted}>
          {GROUPON_GITHUB.unreadTeams} {unreadTeams.join(", ")}
        </Text>
      ) : null}
      {shown.length === 0 ? <Text style={styles.muted}>{GROUPON_GITHUB.noRepository}</Text> : null}
      {shown.map((repository) => (
        <Row
          key={repository.fullName}
          id={repository.fullName}
          icon="repo"
          title={repository.name}
          subtitle={repositoryHint(repository)}
          onSelect={choose}
          testID={`groupon-github-repo-${repository.name}`}
        />
      ))}
    </View>
  );
}

function FolderStep({
  folder,
  download,
  onFolder,
  onDownload,
  repository,
}: StepBodyProps & { repository: GithubRepository }) {
  const running = download.status === "running";
  const start = useCallback(() => onDownload(repository), [onDownload, repository]);
  return (
    <View style={styles.list}>
      <Text style={styles.label}>{GROUPON_GITHUB.folderLabel}</Text>
      <EditingTextInput
        initialValue={folder}
        onChangeText={onFolder}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!running}
        style={styles.input}
        testID="groupon-github-folder"
      />
      <Text style={styles.muted}>
        {GROUPON_GITHUB.landsAt} {checkoutPathPreview(folder, repository)}
      </Text>
      {download.status === "failed" ? <Text style={styles.error}>{download.error}</Text> : null}
      {download.status === "running" ? <Waiting text={download.phase} /> : null}
      <View style={styles.actions}>
        <Button
          variant="default"
          onPress={start}
          loading={running}
          disabled={running}
          testID="groupon-github-download"
        >
          {GROUPON_GITHUB.download}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: {
    gap: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  rowTitleMuted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  rowSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  label: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    marginTop: theme.spacing[2],
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
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  error: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[2],
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    marginTop: theme.spacing[3],
  },
}));
