// Added for Groupon Desk (fork of Paseo, Apache-2.0): Add a project, From GitHub, with Groupon's organisations and teams; the folder step names the Macs that already have the repository.

/**
 * The one GitHub way to add a project (Paseo's own "Clone from GitHub" is taken off the menu),
 * on github.com or on Groupon's GitHub Enterprise (github.groupondev.com), switched at the top and
 * remembered on the device. On github.com the person's organisations and teams as the platform
 * sees them (the internal plane's GitHub overview and each team's repositories, read by the
 * Groupon plugin on the chosen Mac with the CLI's session there); on the enterprise as gh reads
 * them on that Mac, plus any other organisation found by name and opened on its visible
 * repositories. A host gh is not signed in to shows the command that signs it in, with Copy,
 * instead of a list; an organisation whose SAML single sign-on refuses gh's token (GitHub's 403,
 * in a team's, a read's or a clone's problem) shows the command that asks for the authorisation,
 * `gh auth refresh -h <host> -s read:org`, with Copy. The sheet opens on the repositories of the organisation and team picked last
 * time on that host, or the first organisation the person is in (`firstStep`), with Back to change
 * them. Then a repository, then the folder (the Mac's checkout folder, `~/Documents/GitHub` unless
 * the person's setup says otherwise, browsed on that Mac with `FolderBrowserPanel`): the plugin clones it from its host the way the CLI does
 * (`gh repo clone`, git over https without gh), and from there it is what Paseo's clone does after
 * its pick: the checkout is registered as a project with Paseo's own `project.add` and New
 * workspace opens on it. Opened from New workspace on one repository (`prefill`: a Mac that lacks
 * the repository the person chose), it starts at the folder step on that repository's host and,
 * once the clone is a project, closes back to New workspace instead of navigating. The folder step
 * names every Mac that already has the repository, with its path (the hub's checkouts), above the
 * folder browser, so a repository on one Mac is cloned onto another knowingly (`add-to-mac-model.ts`).
 * Its other way, "Already on the Mac" (New workspace's "It is already on <Mac>" opens straight on
 * it), browses that Mac from its home folder to the checkout wherever it lies, whatever its folder
 * is called, and adds it with `project.add` as it is: only a folder whose `origin` names the
 * repository (the daemon's listing says so; `existingCheckoutVerdict`), and what Paseo added is
 * checked once more by its project key (owner, 2026-10-23: "let me choose where the repository is
 * on my computer instead of cloning it into a folder the program picks").
 */

import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { ChevronRight, Folder, RefreshCw, Users } from "lucide-react-native";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { GitHubIcon } from "@/components/icons/github-icon";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useFetchQuery } from "@/data/query";
import type { OpenProjectResult } from "@/hooks/open-project";
import { useOpenProject } from "@/hooks/use-open-project";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { openExternalUrl } from "@/utils/open-external-url";
import { MacsHoldingRepository, useMacsHoldingRepository } from "./add-to-mac";
import { CopyLine } from "./copy-line";
import { FolderBrowserPanel } from "./folder-browser";
import type { FolderListing } from "./folder-browser-model";
import {
  followJob,
  pluginProblemText,
  readGithubAccess,
  readGithubRepositories,
  startGithubClone,
  type GithubAccessAnswer,
  type GithubHost,
  type GithubRepository,
  type PluginRpcClient,
} from "./desk-plugin-rpc";
import {
  addedProjectVerdict,
  ALL_TEAMS,
  browsesOrganisation,
  canAddExisting,
  checkoutPathPreview,
  existingCheckoutVerdict,
  firstStep,
  folderProblem,
  prefilledStep,
  GITHUB_COM,
  hostChoices,
  isSsoBlock,
  matching,
  organisationHint,
  organisationOf,
  organisationsOf,
  otherOrganisationsMatching,
  placeOn,
  previousStep,
  repositoriesOf,
  repositoryHint,
  repositoryRemote,
  signInNeeded,
  ssoRefreshCommand,
  stepTitle,
  teamHint,
  type ExistingCheckoutVerdict,
  type FolderMode,
  type GithubStep,
} from "./github-project-model";
import { type GithubProjectPrefill, useGithubProjectStore } from "./github-project-store";
import { useGrouponPreferences } from "./preferences";
import { SheetSubtitle } from "./sheet-subtitle";
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

type AddedProject = Extract<OpenProjectResult, { ok: true }>["project"];

/** What the folder browser of the existing way reports; the folder itself is read off the listing. */
interface LookedFolder {
  chosenPath: string;
  listing: FolderListing | null;
}

const FIRST_LOOK: LookedFolder = { chosenPath: "~", listing: null };
const ignoreFolder = () => {};

/** Mounted once beside Paseo's Add project flow; draws the sheet while a request is open. */
export function GithubProjectSheetHost() {
  const request = useGithubProjectStore((state) => state.request);
  const close = useGithubProjectStore((state) => state.close);
  if (!request) return null;
  return (
    <GithubProjectSheet
      key={request.id}
      serverId={request.serverId}
      prefill={request.prefill}
      onClose={close}
    />
  );
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

function GithubProjectSheet({
  serverId,
  prefill,
  onClose,
}: {
  serverId: string;
  prefill: GithubProjectPrefill | null;
  onClose: () => void;
}) {
  const client = useHostRuntimeClient(serverId);
  const hostLabel = useHosts().find((host) => host.serverId === serverId)?.label ?? serverId;
  const openProject = useOpenProject(serverId);
  const queryClient = useQueryClient();
  const rememberedHost = useGrouponPreferences((state) => state.githubHost ?? null);
  const [host, setHost] = useState(() => prefill?.host ?? rememberedHost ?? GITHUB_COM);
  const [chosenStep, setStep] = useState<GithubStep | null>(() =>
    prefill ? prefilledStep(prefill.fullName) : null,
  );
  const [query, setQuery] = useState("");
  const [folder, setFolder] = useState<string | null>(null);
  const [mode, setMode] = useState<FolderMode>(() => prefill?.mode ?? "clone");
  const [download, setDownload] = useState<Download>({ status: "idle" });
  const live = useRef(true);
  useEffect(
    () => () => {
      live.current = false;
    },
    [],
  );

  const queryKey = useMemo(() => ["groupon-github-access", serverId, host], [serverId, host]);
  const access = useFetchQuery({
    queryKey,
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readGithubAccess(client, host, false);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 60_000,
  });
  const answer = access.data ?? null;
  const signIn = signInNeeded(answer);
  const githubPlaces = useGrouponPreferences((state) => state.githubPlaces ?? null);
  const githubOrganisation = useGrouponPreferences((state) => state.githubOrganisation ?? null);
  const githubTeam = useGrouponPreferences((state) => state.githubTeam ?? null);
  const rememberGithubPlace = useGrouponPreferences((state) => state.rememberGithubPlace);
  const rememberGithubHost = useGrouponPreferences((state) => state.rememberGithubHost);
  // Until the person moves, the step follows the answer: it opens where they worked last on this host.
  const step = useMemo<GithubStep>(
    () =>
      chosenStep ??
      (answer
        ? firstStep(answer, placeOn({ githubPlaces, githubOrganisation, githubTeam }, host))
        : { kind: "organisations" }),
    [answer, chosenStep, githubOrganisation, githubPlaces, githubTeam, host],
  );
  const shownFolder = folder ?? answer?.defaultFolder ?? "~/Documents/GitHub";

  const refresh = useCallback(async () => {
    if (!client) return;
    queryClient.setQueryData(queryKey, await readGithubAccess(client, host, true));
  }, [client, host, queryClient, queryKey]);

  const go = useCallback(
    (next: GithubStep) => {
      setQuery("");
      setStep(next);
      if (next.kind === "repositories") rememberGithubPlace(host, next.organisation, next.team);
    },
    [host, rememberGithubPlace],
  );

  const switchHost = useCallback(
    (next: string) => {
      if (download.status === "running" || next === host) return;
      setHost(next);
      setStep(null);
      setQuery("");
      setDownload({ status: "idle" });
      rememberGithubHost(next);
    },
    [download.status, host, rememberGithubHost],
  );

  const back = useCallback(() => {
    if (download.status === "running") return;
    const previous = previousStep(step, answer);
    if (previous) go(previous);
    else onClose();
  }, [answer, download.status, go, onClose, step]);

  const switchMode = useCallback(
    (next: FolderMode) => {
      if (download.status === "running") return;
      setMode(next);
      setDownload({ status: "idle" });
    },
    [download.status],
  );

  /** The project Paseo holds now: back to New workspace when it asked, else New workspace on it. */
  const finish = useCallback(
    (project: AddedProject) => {
      onClose();
      // New workspace asked for this repository: it picks the new project up on this Mac itself.
      if (prefill) return;
      router.push(
        buildNewWorkspaceRoute({
          serverId,
          projectId: project.projectId,
          sourceDirectory: project.projectRootPath,
          displayName: project.projectDisplayName,
        }),
      );
    },
    [onClose, prefill, serverId],
  );

  const addExisting = useCallback(
    async (repository: GithubRepository, path: string) => {
      if (download.status === "running") return;
      setDownload({ status: "running", phase: GROUPON_GITHUB.addingExisting(path) });
      try {
        const added = await openProject(path);
        if (!live.current) return;
        if (!added.ok) {
          setDownload({ status: "failed", error: added.error ?? GROUPON_GITHUB.notAdded(path) });
          return;
        }
        const verdict = addedProjectVerdict(
          added.project.projectKey,
          repositoryRemote(host, repository.fullName),
        );
        if (verdict.kind === "other") {
          setDownload({
            status: "failed",
            error: GROUPON_GITHUB.addedOther(verdict.label, repository.fullName),
          });
          return;
        }
        finish(added.project);
      } catch (error) {
        if (live.current) setDownload({ status: "failed", error: pluginProblemText(error) });
      }
    },
    [download.status, finish, host, openProject],
  );

  const startDownload = useCallback(
    async (repository: GithubRepository) => {
      if (!client || download.status === "running") return;
      const problem = folderProblem(shownFolder);
      if (problem) {
        setDownload({ status: "failed", error: problem });
        return;
      }
      setDownload({ status: "running", phase: `Cloning ${repository.fullName}` });
      try {
        const jobId = await startGithubClone(client, host, repository.fullName, shownFolder);
        const job = await followJob(
          client,
          jobId,
          (next) => setDownload({ status: "running", phase: next.phase }),
          () => live.current,
        );
        if (!job) return;
        if (job.status === "failed" || !job.clone) {
          setDownload({ status: "failed", error: job.error ?? "The clone did not finish." });
          return;
        }
        const checkoutPath = job.clone.checkoutPath;
        setDownload({ status: "running", phase: `Adding ${checkoutPath} as a project` });
        const added = await openProject(checkoutPath);
        if (!added.ok) {
          setDownload({
            status: "failed",
            error: added.error ?? `Cloned to ${checkoutPath}, but it could not be added.`,
          });
          return;
        }
        finish(added.project);
      } catch (error) {
        if (live.current) setDownload({ status: "failed", error: pluginProblemText(error) });
      }
    },
    [client, download.status, finish, host, openProject, shownFolder],
  );

  const header = useMemo<SheetHeader>(() => {
    const addsExisting = step.kind === "folder" && mode === "existing";
    const base: SheetHeader = {
      title: stepTitle(step, GROUPON_GITHUB.title, GROUPON_GITHUB.allTeams, answer),
      subtitle: (
        <SheetSubtitle
          text={`${addsExisting ? GROUPON_GITHUB.addsFrom : GROUPON_GITHUB.downloadsTo} ${hostLabel}`}
        />
      ),
    };
    if (step.kind !== "organisations") base.back = { onPress: back, label: "Back" };
    if (step.kind !== "folder") {
      base.search = {
        onChange: setQuery,
        resetKey: `${host}:${step.kind}`,
        placeholder: GROUPON_GITHUB.searchPlaceholder,
        testID: "groupon-github-search",
      };
    }
    return base;
  }, [answer, back, host, hostLabel, mode, step]);

  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      testID="groupon-github-sheet"
      desktopMaxWidth={560}
      snapPoints={SNAP_POINTS}
    >
      <HostSwitch
        hosts={hostChoices(answer)}
        host={host}
        locked={download.status === "running"}
        onChange={switchHost}
      />
      {access.isLoading ? <Waiting text={GROUPON_GITHUB.reading} /> : null}
      {access.error ? <Text style={styles.error}>{pluginProblemText(access.error)}</Text> : null}
      {signIn ? <SignIn row={signIn} onRefresh={refresh} /> : null}
      {answer?.problem && !signIn ? (
        <Problem text={answer.problem} host={host} onRefresh={refresh} />
      ) : null}
      {answer && !(signIn && answer.access === null) ? (
        <StepBody
          step={step}
          answer={answer}
          client={client}
          serverId={serverId}
          host={host}
          query={query}
          folder={shownFolder}
          download={download}
          mode={mode}
          macLabel={hostLabel}
          onFolder={setFolder}
          onMode={switchMode}
          onGo={go}
          onDownload={startDownload}
          onAddExisting={addExisting}
          onRefresh={refresh}
        />
      ) : null}
    </AdaptiveModalSheet>
  );
}

function HostSwitch({
  hosts,
  host,
  locked,
  onChange,
}: {
  hosts: string[];
  host: string;
  locked: boolean;
  onChange: (host: string) => void;
}) {
  const options = useMemo(
    () =>
      hosts.map((value) => ({
        value,
        label: value,
        disabled: locked && value !== host,
        testID: `groupon-github-host-${value}`,
      })),
    [host, hosts, locked],
  );
  return (
    <View style={styles.hosts} accessibilityLabel={GROUPON_GITHUB.hostSwitch}>
      <SegmentedControl
        options={options}
        value={host}
        onValueChange={onChange}
        size="sm"
        testID="groupon-github-hosts"
      />
    </View>
  );
}

/** A host gh is not signed in to: what to run, copyable, and Read again once it ran. */
function SignIn({ row, onRefresh }: { row: GithubHost; onRefresh: () => Promise<void> }) {
  const refresh = useCallback(() => {
    onRefresh().catch(() => {});
  }, [onRefresh]);
  return (
    <View style={styles.list} testID="groupon-github-sign-in">
      <Text style={styles.muted}>
        {GROUPON_GITHUB.notSignedIn} {row.host}. {GROUPON_GITHUB.runThis}
      </Text>
      <CopyLine
        text={row.signIn ?? ""}
        accessibilityLabel={GROUPON_GITHUB.signInLabel}
        testID="groupon-github-sign-in-command"
      />
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" leftIcon={RefreshCw} onPress={refresh}>
          {GROUPON_GITHUB.refresh}
        </Button>
      </View>
    </View>
  );
}

/**
 * The organisation's SAML single sign-on refuses gh's token on this Mac (`isSsoBlock`): the
 * command that asks for the authorisation, copyable, and Read again once it ran.
 */
function SsoBlocked({ host, onRefresh }: { host: string; onRefresh: () => Promise<void> }) {
  const command = ssoRefreshCommand(host);
  const refresh = useCallback(() => {
    onRefresh().catch(() => {});
  }, [onRefresh]);
  return (
    <View style={styles.list} testID="groupon-github-sso">
      <Text style={styles.error}>{GROUPON_GITHUB.ssoBlocked(command)}</Text>
      <CopyLine
        text={command}
        accessibilityLabel={GROUPON_GITHUB.ssoCommandLabel}
        testID="groupon-github-sso-command"
      />
      <View style={styles.actions}>
        <Button variant="ghost" size="sm" leftIcon={RefreshCw} onPress={refresh}>
          {GROUPON_GITHUB.refresh}
        </Button>
      </View>
    </View>
  );
}

/** A problem the plugin or GitHub gave: single sign-on with its fix, anything else in its own words. */
function Problem({
  text,
  host,
  onRefresh,
}: {
  text: string;
  host: string;
  onRefresh: () => Promise<void>;
}) {
  if (isSsoBlock(text)) return <SsoBlocked host={host} onRefresh={onRefresh} />;
  return <Text style={styles.error}>{text}</Text>;
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
  client: PluginRpcClient | null;
  serverId: string;
  host: string;
  query: string;
  folder: string;
  download: Download;
  /** The folder step's way: clone a new copy, or add the checkout already on the Mac. */
  mode: FolderMode;
  /** The Mac the sheet is for, as the window names it. */
  macLabel: string;
  onFolder: (folder: string) => void;
  onMode: (mode: FolderMode) => void;
  onGo: (step: GithubStep) => void;
  onDownload: (repository: GithubRepository) => void;
  onAddExisting: (repository: GithubRepository, path: string) => void;
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

function OrganisationsStep({ answer, host, query, onGo, onRefresh }: StepBodyProps) {
  const organisations = matching(
    organisationsOf(answer),
    query,
    (org) => `${org.login} ${org.purpose}`,
  );
  const others = otherOrganisationsMatching(answer, query);
  const browsable = (answer.access?.otherOrganisations?.length ?? 0) > 0;
  const choose = useCallback(
    (login: string) =>
      onGo(
        browsesOrganisation(answer, login)
          ? { kind: "repositories", organisation: login, team: ALL_TEAMS }
          : { kind: "teams", organisation: login },
      ),
    [answer, onGo],
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
      {answer.access && organisations.length === 0 && others.length === 0 ? (
        <Text style={styles.muted}>
          {answer.access.otherOrganisations
            ? GROUPON_GITHUB.noOrganisationHere
            : GROUPON_GITHUB.noOrganisation}
        </Text>
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
      {browsable && !query.trim() ? (
        <Text style={styles.muted}>
          {GROUPON_GITHUB.findOther} {host}
        </Text>
      ) : null}
      {others.map((login) => (
        <Row
          key={login}
          id={login}
          icon="org"
          title={login}
          subtitle={GROUPON_GITHUB.otherOrganisation}
          onSelect={choose}
          testID={`groupon-github-other-org-${login}`}
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
  host,
  query,
  onGo,
  onRefresh,
  organisation,
}: StepBodyProps & { organisation: string }) {
  const org = organisationOf(answer, organisation);
  const { ssoBlocked } = repositoriesOf(org, ALL_TEAMS);
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
      {ssoBlocked ? <SsoBlocked host={host} onRefresh={onRefresh} /> : null}
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
          subtitle={teamHint(team, GROUPON_GITHUB.teamUnread, GROUPON_GITHUB.ssoTeam)}
          onSelect={choose}
          testID={`groupon-github-team-${team.slug}`}
        />
      ))}
    </View>
  );
}

type RepositoriesStepProps = StepBodyProps & { organisation: string; team: string };

function RepositoriesStep(props: RepositoriesStepProps) {
  if (browsesOrganisation(props.answer, props.organisation)) {
    return <OrganisationRepositoriesStep {...props} />;
  }
  const { repositories, unreadTeams, ssoBlocked } = repositoriesOf(
    organisationOf(props.answer, props.organisation),
    props.team,
  );
  return (
    <RepositoryRows {...props} repositories={repositories}>
      {ssoBlocked ? <SsoBlocked host={props.host} onRefresh={props.onRefresh} /> : null}
      {unreadTeams.length > 0 ? (
        <Text style={styles.muted}>
          {GROUPON_GITHUB.unreadTeams} {unreadTeams.join(", ")}
        </Text>
      ) : null}
    </RepositoryRows>
  );
}

/** An enterprise organisation opened on its own repositories, read from the Mac when opened. */
function OrganisationRepositoriesStep(props: RepositoriesStepProps) {
  const { client, serverId, host, organisation, onRefresh } = props;
  const read = useFetchQuery({
    queryKey: ["groupon-github-repositories", serverId, host, organisation],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readGithubRepositories(client, host, organisation, false);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 60_000,
  });
  if (read.isLoading) return <Waiting text={GROUPON_GITHUB.readingRepositories} />;
  const problem = read.error ? pluginProblemText(read.error) : (read.data?.problem ?? null);
  return (
    <RepositoryRows {...props} repositories={read.data?.repositories ?? []}>
      {problem ? <Problem text={problem} host={host} onRefresh={onRefresh} /> : null}
    </RepositoryRows>
  );
}

function RepositoryRows({
  query,
  onGo,
  organisation,
  team,
  repositories,
  children,
}: RepositoriesStepProps & { repositories: GithubRepository[]; children?: ReactNode }) {
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
      {children}
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

type FolderStepProps = StepBodyProps & { repository: GithubRepository };

function FolderStep(props: FolderStepProps) {
  const { host, serverId, repository, mode, download, onMode } = props;
  const holdings = useMacsHoldingRepository(host, repository.fullName, serverId);
  return (
    <View style={styles.list}>
      <MacsHoldingRepository holdings={holdings} />
      <FolderModeSwitch mode={mode} locked={download.status === "running"} onChange={onMode} />
      {mode === "existing" ? <ExistingFolder {...props} /> : <CloneFolder {...props} />}
    </View>
  );
}

function FolderModeSwitch({
  mode,
  locked,
  onChange,
}: {
  mode: FolderMode;
  locked: boolean;
  onChange: (mode: FolderMode) => void;
}) {
  const options = useMemo(
    () =>
      (["clone", "existing"] as const).map((value) => ({
        value,
        label: value === "clone" ? GROUPON_GITHUB.modeClone : GROUPON_GITHUB.modeExisting,
        disabled: locked && value !== mode,
        testID: `groupon-github-mode-${value}`,
      })),
    [locked, mode],
  );
  return (
    <View style={styles.hosts} accessibilityLabel={GROUPON_GITHUB.modeSwitch}>
      <SegmentedControl
        options={options}
        value={mode}
        onValueChange={onChange}
        size="sm"
        testID="groupon-github-mode"
      />
    </View>
  );
}

function CloneFolder({
  folder,
  host,
  serverId,
  download,
  onFolder,
  onDownload,
  onRefresh,
  repository,
}: FolderStepProps) {
  const running = download.status === "running";
  const start = useCallback(() => onDownload(repository), [onDownload, repository]);
  // The folder is browsed on that Mac, one click at a time; the field still takes a typed path.
  const [initialFolder] = useState(folder);
  return (
    <>
      <Text style={styles.label}>{GROUPON_GITHUB.folderLabel}</Text>
      <FolderBrowserPanel
        serverId={serverId}
        initialFolder={initialFolder}
        disabled={running}
        onChange={onFolder}
      />
      <Text style={styles.muted}>
        {GROUPON_GITHUB.landsAt} {checkoutPathPreview(folder, repository)}
      </Text>
      <DownloadState download={download} host={host} onRefresh={onRefresh} />
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
    </>
  );
}

/** The existing way: browse to the checkout from the home folder and add the folder looked at. */
function ExistingFolder({
  host,
  serverId,
  macLabel,
  download,
  onAddExisting,
  onRefresh,
  repository,
}: FolderStepProps) {
  const running = download.status === "running";
  const target = useMemo(
    () => repositoryRemote(host, repository.fullName),
    [host, repository.fullName],
  );
  const [looked, setLooked] = useState<LookedFolder>(FIRST_LOOK);
  const verdict = existingCheckoutVerdict({ ...looked, target });
  const add = useCallback(
    () => onAddExisting(repository, looked.chosenPath),
    [looked.chosenPath, onAddExisting, repository],
  );
  return (
    <>
      <Text style={styles.muted}>{GROUPON_GITHUB.existingHint(repository.fullName, macLabel)}</Text>
      <FolderBrowserPanel
        serverId={serverId}
        initialFolder="~"
        disabled={running}
        onChange={ignoreFolder}
        onLooked={setLooked}
        markRemote={target}
      />
      <ExistingVerdictLine verdict={verdict} repository={repository.fullName} macLabel={macLabel} />
      <DownloadState download={download} host={host} onRefresh={onRefresh} />
      <View style={styles.actions}>
        <Button
          variant="default"
          onPress={add}
          loading={running}
          disabled={running || !canAddExisting(verdict)}
          testID="groupon-github-add-existing"
        >
          {GROUPON_GITHUB.addExisting}
        </Button>
      </View>
    </>
  );
}

function ExistingVerdictLine({
  verdict,
  repository,
  macLabel,
}: {
  verdict: ExistingCheckoutVerdict;
  repository: string;
  macLabel: string;
}) {
  switch (verdict.kind) {
    case "loading":
      return null;
    case "match":
      return (
        <Text style={styles.muted} testID="groupon-github-existing-verdict">
          {GROUPON_GITHUB.existingMatch(repository)}
        </Text>
      );
    case "other":
      return (
        <Text style={styles.error} testID="groupon-github-existing-verdict">
          {GROUPON_GITHUB.existingOther(verdict.label, repository)}
        </Text>
      );
    case "notCheckout":
      return (
        <Text style={styles.muted} testID="groupon-github-existing-verdict">
          {GROUPON_GITHUB.existingNotCheckout(repository)}
        </Text>
      );
    case "unnamed":
      return (
        <Text style={styles.muted} testID="groupon-github-existing-verdict">
          {GROUPON_GITHUB.existingUnnamed}
        </Text>
      );
    case "olderMac":
      return (
        <Text style={styles.error} testID="groupon-github-existing-verdict">
          {GROUPON_GITHUB.existingOlderMac(macLabel)}
        </Text>
      );
    default: {
      const exhaustive: never = verdict;
      return exhaustive;
    }
  }
}

/** A clone or an add that failed (single sign-on with its fix), or the phase it runs in. */
function DownloadState({
  download,
  host,
  onRefresh,
}: {
  download: Download;
  host: string;
  onRefresh: () => Promise<void>;
}) {
  if (download.status === "failed") {
    return <Problem text={download.error} host={host} onRefresh={onRefresh} />;
  }
  return download.status === "running" ? <Waiting text={download.phase} /> : null;
}

const styles = StyleSheet.create((theme) => ({
  hosts: {
    alignItems: "flex-start",
    marginBottom: theme.spacing[2],
  },
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
