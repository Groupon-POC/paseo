// Added for Groupon Desk (fork of Paseo, Apache-2.0): Settings > Standards, the engineering standards of the repository you work in.

/**
 * The engineering standards of one repository on one of the person's Macs, read from the
 * repository itself by the Groupon plugin there (`groupon.standards`): the pulled copy
 * (`.standards/`) or the repository's own `_documentation/engineering-standards/`. The documents
 * in reading order (how to name a branch and how to title a pull request first), one rendered as
 * markdown with the renderer Paseo's file pane uses, and "Pull the standards", which runs
 * `groupon standards pull` in that checkout. A repository without standards says so and points at
 * `groupon standards adopt`. The repository picked is remembered on the device; the home page's
 * Standards tile opens this page.
 */

import { BookOpen, Download, RefreshCw } from "lucide-react-native";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useFetchQuery } from "@/data/query";
import { FileMarkdownPreview } from "@/file-pane/markdown-preview";
import { useProjects } from "@/hooks/use-projects";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { useQueryClient } from "@tanstack/react-query";
import { CopyLine } from "./copy-line";
import {
  pluginProblemText,
  readStandards,
  type StandardsAnswer,
  type StandardsDocument,
} from "./desk-plugin-rpc";
import { useGrouponPreferences } from "./preferences";
import {
  ADOPT_COMMAND,
  chosenDocument,
  chosenProject,
  documentHint,
  markdownBody,
  pullLabel,
  standardsProjectsOf,
  standardsSourceText,
  type StandardsProject,
} from "./standards-model";
import { GROUPON_STANDARDS } from "./strings";

const mutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedSpinner = withUnistyles(LoadingSpinner);
const ThemedBook = withUnistyles(BookOpen);
const SELECTED = { selected: true };
const NOT_SELECTED = { selected: false };

/** The settings page: the repository, its documents, the one open, and the pull. */
export function GrouponStandardsPage() {
  const { projects } = useProjects();
  const rows = standardsProjectsOf(projects);
  const remembered = useGrouponPreferences((state) => state.standardsPlace ?? null);
  const remember = useGrouponPreferences((state) => state.rememberStandardsPlace);
  const project = chosenProject(rows, remembered);
  return (
    <SettingsSection title={GROUPON_STANDARDS.sectionTitle}>
      <View style={styles.page} testID="groupon-standards-page">
        <Text style={styles.intro}>{GROUPON_STANDARDS.intro}</Text>
        {project ? (
          <>
            <ProjectPicker projects={rows} chosen={project} onChoose={remember} />
            <StandardsOf key={`${project.serverId}:${project.repoRoot}`} project={project} />
          </>
        ) : (
          <Text style={styles.muted}>{GROUPON_STANDARDS.noProject}</Text>
        )}
      </View>
    </SettingsSection>
  );
}

function ProjectPicker({
  projects,
  chosen,
  onChoose,
}: {
  projects: StandardsProject[];
  chosen: StandardsProject;
  onChoose: (serverId: string, repoRoot: string) => void;
}) {
  const several = new Set(projects.map((project) => project.serverId)).size > 1;
  return (
    <View style={styles.pickerRow}>
      <Text style={styles.label}>{GROUPON_STANDARDS.project}</Text>
      <View style={styles.chips}>
        {projects.map((project) => (
          <ProjectChip
            key={`${project.serverId}:${project.repoRoot}`}
            project={project}
            selected={project.serverId === chosen.serverId && project.repoRoot === chosen.repoRoot}
            showMac={several}
            onChoose={onChoose}
          />
        ))}
      </View>
    </View>
  );
}

function ProjectChip({
  project,
  selected,
  showMac,
  onChoose,
}: {
  project: StandardsProject;
  selected: boolean;
  showMac: boolean;
  onChoose: (serverId: string, repoRoot: string) => void;
}) {
  const { serverId, repoRoot } = project;
  const choose = useCallback(() => onChoose(serverId, repoRoot), [onChoose, serverId, repoRoot]);
  return (
    <PressHighlight
      onPress={choose}
      accessibilityRole="button"
      accessibilityState={selected ? SELECTED : NOT_SELECTED}
      style={selected ? styles.chipSelected : styles.chip}
      testID={`groupon-standards-project-${project.name}`}
    >
      <Text style={selected ? styles.chipTextSelected : styles.chipText} numberOfLines={1}>
        {project.name}
        {showMac ? ` · ${project.serverName}` : ""}
      </Text>
    </PressHighlight>
  );
}

function StandardsOf({ project }: { project: StandardsProject }) {
  const client = useHostRuntimeClient(project.serverId);
  const queryClient = useQueryClient();
  const { serverId, repoRoot } = project;
  const listKey = useMemo(() => ["groupon-standards", serverId, repoRoot], [serverId, repoRoot]);
  const list = useFetchQuery({
    queryKey: listKey,
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readStandards(client, repoRoot);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 30_000,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [pull, setPull] = useState<
    { status: "idle" } | { status: "running" } | { status: "done"; ok: boolean; message: string }
  >({ status: "idle" });
  const runPull = useCallback(async () => {
    if (!client) return;
    setPull({ status: "running" });
    try {
      const answer = await readStandards(client, repoRoot, "pull");
      queryClient.setQueryData(listKey, answer);
      await queryClient.invalidateQueries({ queryKey: ["groupon-standards-document"] });
      setPull({
        status: "done",
        ok: answer.pull?.ok ?? false,
        message: answer.pull?.message ?? answer.problem ?? "",
      });
    } catch (error) {
      setPull({ status: "done", ok: false, message: pluginProblemText(error) });
    }
  }, [client, repoRoot, queryClient, listKey]);
  const pressPull = useCallback(() => {
    void runPull();
  }, [runPull]);
  const refetch = list.refetch;
  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const answer = list.data;
  if (list.error && !answer) {
    return <Text style={styles.problem}>{pluginProblemText(list.error)}</Text>;
  }
  if (!answer) {
    return (
      <View style={styles.loading}>
        <ThemedSpinner size="small" uniProps={mutedMapping} />
        <Text style={styles.muted}>{GROUPON_STANDARDS.reading}</Text>
      </View>
    );
  }
  const document = chosenDocument(answer.documents, picked);
  return (
    <View style={styles.body}>
      <SourceRow
        answer={answer}
        pulling={pull.status === "running"}
        onPull={pressPull}
        onRefresh={refresh}
        refreshing={list.isFetching}
      />
      {pull.status === "done" ? (
        <Text
          style={pull.ok ? styles.muted : styles.problem}
          testID="groupon-standards-pull-outcome"
        >
          {pull.message}
        </Text>
      ) : null}
      {answer.problem ? <Text style={styles.problem}>{answer.problem}</Text> : null}
      {answer.layout === "none" ? (
        <View style={styles.none} testID="groupon-standards-none">
          <Text style={styles.noneTitle}>{GROUPON_STANDARDS.none}</Text>
          <Text style={styles.muted}>{GROUPON_STANDARDS.noneHint}</Text>
          <CopyLine
            text={ADOPT_COMMAND}
            accessibilityLabel={GROUPON_STANDARDS.adoptLabel}
            testID="groupon-standards-adopt"
          />
        </View>
      ) : (
        <View style={styles.reader}>
          <View style={styles.documents} testID="groupon-standards-documents">
            {answer.documents.map((entry) => (
              <DocumentRow
                key={entry.file}
                document={entry}
                selected={entry.file === document?.file}
                onPick={setPicked}
              />
            ))}
          </View>
          {document ? (
            <DocumentView
              client={client}
              serverId={serverId}
              repoRoot={repoRoot}
              folder={answer.folder}
              readAt={answer.readAt}
              document={document}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function SourceRow({
  answer,
  pulling,
  onPull,
  onRefresh,
  refreshing,
}: {
  answer: StandardsAnswer;
  pulling: boolean;
  onPull: () => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const source = standardsSourceText(answer);
  return (
    <View style={styles.sourceRow}>
      <Text style={styles.source} selectable numberOfLines={2}>
        {source ? `${GROUPON_STANDARDS.readFrom} ${source}` : ""}
      </Text>
      <View style={styles.actions}>
        <Button
          variant="ghost"
          size="sm"
          leftIcon={RefreshCw}
          onPress={onRefresh}
          loading={refreshing && !pulling}
          testID="groupon-standards-refresh"
        >
          {GROUPON_STANDARDS.refresh}
        </Button>
        {answer.canPull ? (
          <Button
            variant="outline"
            size="sm"
            leftIcon={Download}
            onPress={onPull}
            loading={pulling}
            disabled={pulling}
            testID="groupon-standards-pull"
          >
            {pulling ? GROUPON_STANDARDS.pulling : pullLabel(answer)}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

function DocumentRow({
  document,
  selected,
  onPick,
}: {
  document: StandardsDocument;
  selected: boolean;
  onPick: (file: string) => void;
}) {
  const file = document.file;
  const pick = useCallback(() => onPick(file), [onPick, file]);
  return (
    <PressHighlight
      onPress={pick}
      accessibilityRole="button"
      accessibilityState={selected ? SELECTED : NOT_SELECTED}
      style={selected ? styles.documentSelected : styles.document}
      testID={`groupon-standards-document-${file}`}
    >
      <Text
        style={selected ? styles.documentTitleSelected : styles.documentTitle}
        numberOfLines={1}
      >
        {document.title}
      </Text>
      <Text style={styles.documentHint} numberOfLines={1}>
        {documentHint(document)}
      </Text>
    </PressHighlight>
  );
}

function DocumentView({
  client,
  serverId,
  repoRoot,
  folder,
  readAt,
  document,
}: {
  client: DaemonClient | null;
  serverId: string;
  repoRoot: string;
  folder: string | null;
  readAt: string;
  document: StandardsDocument;
}) {
  const read = useFetchQuery({
    // The list's read time is in the key: a pull or a refresh reads the document again.
    queryKey: ["groupon-standards-document", serverId, repoRoot, document.file, readAt],
    queryFn: async () => {
      if (!client) throw new Error("This Mac is not connected.");
      return readStandards(client, repoRoot, "read", document.file);
    },
    enabled: Boolean(client),
    dataShape: "value",
    retry: false,
    staleTimeMs: 30_000,
  });
  const source = read.data?.document?.markdown;
  const markdown = source === undefined ? null : markdownBody(source);
  return (
    <View style={styles.preview} testID="groupon-standards-preview">
      <View style={styles.previewHeading}>
        <ThemedBook size={16} uniProps={mutedMapping} />
        <Text style={styles.previewTitle}>{document.title}</Text>
      </View>
      {document.summary ? <Text style={styles.summary}>{document.summary}</Text> : null}
      {read.error ? <Text style={styles.problem}>{pluginProblemText(read.error)}</Text> : null}
      {read.data?.problem ? <Text style={styles.problem}>{read.data.problem}</Text> : null}
      {markdown === null && !read.error && !read.data?.problem ? (
        <ThemedSpinner size="small" uniProps={mutedMapping} />
      ) : null}
      {markdown !== null ? (
        <FileMarkdownPreview
          source={markdown}
          filePath={`${repoRoot}/${folder ?? ""}/${document.file}`}
          workspaceRoot={repoRoot}
          client={client}
          serverId={serverId}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  page: {
    gap: theme.spacing[4],
  },
  intro: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: theme.fontSize.base * 1.5,
  },
  muted: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  problem: {
    color: theme.colors.statusWarning,
    fontSize: theme.fontSize.sm,
  },
  label: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  pickerRow: {
    gap: theme.spacing[2],
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing[2],
  },
  chip: {
    maxWidth: 260,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  chipSelected: {
    maxWidth: 260,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.full,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface2,
  },
  chipText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  chipTextSelected: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  body: {
    gap: theme.spacing[3],
  },
  sourceRow: {
    flexDirection: { xs: "column", md: "row" },
    alignItems: { xs: "flex-start", md: "center" },
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  source: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  actions: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  none: {
    gap: theme.spacing[3],
    padding: theme.spacing[4],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  noneTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  reader: {
    flexDirection: { xs: "column", lg: "row" },
    alignItems: "flex-start",
    gap: theme.spacing[4],
  },
  documents: {
    width: { xs: "100%", lg: 240 },
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  document: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    gap: 2,
  },
  documentSelected: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    gap: 2,
    backgroundColor: theme.colors.surface2,
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.accent,
  },
  documentTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  documentTitleSelected: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  documentHint: {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
  },
  preview: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    gap: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  previewHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
  },
  previewTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.medium,
  },
  summary: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[2],
  },
}));
