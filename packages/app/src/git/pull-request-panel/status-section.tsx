// Added for Groupon Desk (fork of Paseo, Apache-2.0): the status display mode of the Activity
// section — reviewers, machine reports and the leftover conversation as check-style rows
// (`status-mode.ts` builds the model). The plain timeline rendering stays in `pane.tsx`; the
// conversation falls back to it through `renderTimelineEntry`.
import { useCallback, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Info,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  OctagonMinus,
  SquareSlash,
} from "lucide-react-native";
import { PressHighlight } from "@/components/ui/press-highlight";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { openExternalUrl } from "@/utils/open-external-url";
import { writeMarkdownToRichClipboard } from "@/utils/rich-clipboard";
import { getDefaultMarkdownClipboardEnvironment } from "@/utils/rich-clipboard-default-environment";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { CheckPresentationIcon } from "@/git/check-presentation.view";
import type { Theme } from "@/styles/theme";
import type { PrPaneActivity } from "./data";
import { getActivityVerbKey } from "./data";
import type { PrTimelineEntry } from "./timeline";
import type {
  PrCommandEntry,
  PrReportEntry,
  PrReviewerGroup,
  PrReviewRound,
  PrSeverityCount,
  PrStatusModel,
} from "./status-mode";
import type { PrReportStatus } from "./status-rules";
import { canAddPullRequestActivityToChat } from "./context-attachment";
import { foregroundMutedColorMapping, sectionKitStyles, warningColorMapping } from "./section-kit";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedCopy = withUnistyles(Copy);
const ThemedExternalLink = withUnistyles(ExternalLink);
const ThemedInfo = withUnistyles(Info);
const ThemedMessageSquare = withUnistyles(MessageSquare);
const ThemedMessageSquarePlus = withUnistyles(MessageSquarePlus);
const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedOctagonMinus = withUnistyles(OctagonMinus);
const ThemedSquareSlash = withUnistyles(SquareSlash);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

const ADD_TO_CHAT_MENU_ICON = (
  <ThemedMessageSquarePlus size={14} uniProps={foregroundMutedColorMapping} />
);
const COPY_MENU_ICON = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const OPEN_MENU_ICON = <ThemedExternalLink size={14} uniProps={foregroundMutedColorMapping} />;

const REPORT_STATUS_PRESENTATION: Record<
  Exclude<PrReportStatus, "info">,
  "success" | "failure" | "pending" | "warning"
> = {
  success: "success",
  failure: "failure",
  pending: "pending",
  warning: "warning",
};

function useRevealOnHover() {
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const actionsVisible = isHovered || menuOpen || isNative || isCompact;
  return { actionsVisible, handlePointerEnter, handlePointerLeave, setMenuOpen };
}

export interface PrStatusSectionProps {
  model: PrStatusModel;
  attachEnabled: boolean;
  brandLabel: string;
  onAddToChat: (activity: PrPaneActivity) => void;
  /** Renders a leftover timeline entry exactly as the plain timeline mode would. */
  renderTimelineEntry: (entry: PrTimelineEntry) => ReactNode;
}

export function PrStatusSection({
  model,
  attachEnabled,
  brandLabel,
  onAddToChat,
  renderTimelineEntry,
}: PrStatusSectionProps) {
  const { t } = useTranslation();
  const conversationCount = model.conversation.length + model.commands.length;
  const hasReports =
    model.attentionReports.length + model.passedReports.length + model.infoReports.length > 0;

  return (
    <View testID="pr-pane-status-mode">
      {model.reviewers.length > 0 ? (
        <>
          <Text style={styles.groupLabel}>{t("workspace.git.pr.status.groups.reviews")}</Text>
          {model.reviewers.map((reviewer) => (
            <ReviewerRow
              key={reviewer.id}
              reviewer={reviewer}
              attachEnabled={attachEnabled}
              brandLabel={brandLabel}
              onAddToChat={onAddToChat}
              renderTimelineEntry={renderTimelineEntry}
            />
          ))}
        </>
      ) : null}

      {hasReports ? (
        <>
          <Text style={styles.groupLabel}>{t("workspace.git.pr.status.groups.reports")}</Text>
          {model.attentionReports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              attachEnabled={attachEnabled}
              brandLabel={brandLabel}
              onAddToChat={onAddToChat}
            />
          ))}
          <ReportFold
            label={t("workspace.git.pr.status.passed", { count: model.passedReports.length })}
            iconKind="success"
            reports={model.passedReports}
            attachEnabled={attachEnabled}
            brandLabel={brandLabel}
            onAddToChat={onAddToChat}
          />
          <ReportFold
            label={t("workspace.git.pr.status.headsUp", { count: model.infoReports.length })}
            iconKind="info"
            reports={model.infoReports}
            attachEnabled={attachEnabled}
            brandLabel={brandLabel}
            onAddToChat={onAddToChat}
          />
        </>
      ) : null}

      {conversationCount > 0 ? (
        <ConversationFold
          count={conversationCount}
          commands={model.commands}
          entries={model.conversation}
          renderTimelineEntry={renderTimelineEntry}
        />
      ) : null}
    </View>
  );
}

function ReviewerRow({
  reviewer,
  attachEnabled,
  brandLabel,
  onAddToChat,
  renderTimelineEntry,
}: {
  reviewer: PrReviewerGroup;
  attachEnabled: boolean;
  brandLabel: string;
  onAddToChat: (activity: PrPaneActivity) => void;
  renderTimelineEntry: (entry: PrTimelineEntry) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => setOpen((value) => !value), []);
  const { actionsVisible, handlePointerEnter, handlePointerLeave, setMenuOpen } =
    useRevealOnHover();
  const { latest } = reviewer;

  return (
    <View
      testID="pr-pane-status-reviewer"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <PressHighlight onPress={handleToggle} style={rowPressableStyle} accessibilityRole="button">
        {open ? (
          <ThemedChevronDown size={12} uniProps={foregroundMutedColorMapping} />
        ) : (
          <ThemedChevronRight size={12} uniProps={foregroundMutedColorMapping} />
        )}
        <RoundStateIcon round={latest} />
        <Text style={sectionKitStyles.checkName} numberOfLines={1}>
          {reviewer.author}
        </Text>
        <SeverityBadges severities={latest.severities} />
        <View style={sectionKitStyles.checkTrailing}>
          <Text style={sectionKitStyles.checkDuration}>
            {t("workspace.git.pr.status.round", { count: reviewer.rounds.length })}
            {" · "}
            {latest.activity.age}
          </Text>
          <ActivityRowKebab
            activity={latest.activity}
            visible={actionsVisible}
            attachEnabled={attachEnabled}
            brandLabel={brandLabel}
            onMenuOpenChange={setMenuOpen}
            onAddToChat={onAddToChat}
          />
        </View>
      </PressHighlight>
      {open ? (
        <View style={styles.roundsFold}>
          {reviewer.rounds.toReversed().map((round) => (
            <RoundRow
              key={round.activity.id}
              round={round}
              attachEnabled={attachEnabled}
              brandLabel={brandLabel}
              onAddToChat={onAddToChat}
            />
          ))}
          {reviewer.rounds
            .flatMap((round) => round.threads)
            .map((thread) => (
              <View key={thread.id} style={styles.foldThread}>
                {renderTimelineEntry(thread)}
              </View>
            ))}
        </View>
      ) : null}
    </View>
  );
}

function RoundRow({
  round,
  attachEnabled,
  brandLabel,
  onAddToChat,
}: {
  round: PrReviewRound;
  attachEnabled: boolean;
  brandLabel: string;
  onAddToChat: (activity: PrPaneActivity) => void;
}) {
  const { t } = useTranslation();
  const { actionsVisible, handlePointerEnter, handlePointerLeave, setMenuOpen } =
    useRevealOnHover();
  const handlePress = useCallback(() => {
    if (round.activity.url !== "") {
      void openExternalUrl(round.activity.url);
    }
  }, [round.activity.url]);
  const summary = round.verdictText ?? t(getActivityVerbKey(round.activity));

  return (
    <View onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <PressHighlight
        onPress={handlePress}
        style={roundPressableStyle}
        testID="pr-pane-status-round"
      >
        <RoundStateIcon round={round} size={12} />
        <Text style={styles.roundText} numberOfLines={1}>
          {summary}
        </Text>
        <View style={sectionKitStyles.checkTrailing}>
          {round.sha ? <Text style={styles.shaText}>{round.sha}</Text> : null}
          <Text style={sectionKitStyles.checkDuration}>{round.activity.age}</Text>
          <ActivityRowKebab
            activity={round.activity}
            visible={actionsVisible}
            attachEnabled={attachEnabled}
            brandLabel={brandLabel}
            onMenuOpenChange={setMenuOpen}
            onAddToChat={onAddToChat}
          />
        </View>
      </PressHighlight>
    </View>
  );
}

function RoundStateIcon({ round, size = 14 }: { round: PrReviewRound; size?: number }) {
  if (round.gated) {
    return <ThemedOctagonMinus size={size} uniProps={warningColorMapping} />;
  }
  if (round.state === "approved") {
    return <CheckPresentationIcon presentation="success" size={size} />;
  }
  if (round.state === "changes_requested") {
    return <CheckPresentationIcon presentation="failure" size={size} />;
  }
  return <ThemedMessageSquare size={size - 1} uniProps={foregroundMutedColorMapping} />;
}

function SeverityBadges({ severities }: { severities: readonly PrSeverityCount[] }) {
  if (severities.length === 0) {
    return null;
  }
  return (
    <View style={styles.severityGroup}>
      {severities.map((severity) => (
        <View key={severity.token} style={styles.severityBadge}>
          <Text style={styles.severityText}>
            {severity.count} {severity.token}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ReportFold({
  label,
  iconKind,
  reports,
  attachEnabled,
  brandLabel,
  onAddToChat,
}: {
  label: string;
  iconKind: "success" | "info";
  reports: readonly PrReportEntry[];
  attachEnabled: boolean;
  brandLabel: string;
  onAddToChat: (activity: PrPaneActivity) => void;
}) {
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => setOpen((value) => !value), []);
  if (reports.length === 0) {
    return null;
  }
  return (
    <View>
      <PressHighlight onPress={handleToggle} style={rowPressableStyle} accessibilityRole="button">
        {open ? (
          <ThemedChevronDown size={12} uniProps={foregroundMutedColorMapping} />
        ) : (
          <ThemedChevronRight size={12} uniProps={foregroundMutedColorMapping} />
        )}
        {iconKind === "success" ? (
          <CheckPresentationIcon presentation="success" size={14} />
        ) : (
          <ThemedInfo size={14} uniProps={foregroundMutedColorMapping} />
        )}
        <Text style={sectionKitStyles.checkName} numberOfLines={1}>
          {label}
        </Text>
      </PressHighlight>
      {open ? (
        <View style={styles.roundsFold}>
          {reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              attachEnabled={attachEnabled}
              brandLabel={brandLabel}
              onAddToChat={onAddToChat}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ReportRow({
  report,
  attachEnabled,
  brandLabel,
  onAddToChat,
}: {
  report: PrReportEntry;
  attachEnabled: boolean;
  brandLabel: string;
  onAddToChat: (activity: PrPaneActivity) => void;
}) {
  const { actionsVisible, handlePointerEnter, handlePointerLeave, setMenuOpen } =
    useRevealOnHover();
  const handlePress = useCallback(() => {
    void openExternalUrl(report.activity.url);
  }, [report.activity.url]);

  return (
    <View onPointerEnter={handlePointerEnter} onPointerLeave={handlePointerLeave}>
      <PressHighlight
        onPress={handlePress}
        style={rowPressableStyle}
        testID="pr-pane-status-report"
      >
        {report.status === "info" ? (
          <ThemedInfo size={14} uniProps={foregroundMutedColorMapping} />
        ) : (
          <CheckPresentationIcon
            presentation={REPORT_STATUS_PRESENTATION[report.status]}
            size={14}
          />
        )}
        <Text style={sectionKitStyles.checkName} numberOfLines={1}>
          {report.title}
        </Text>
        <View style={sectionKitStyles.checkTrailing}>
          {report.sha ? <Text style={styles.shaText}>{report.sha}</Text> : null}
          <Text style={sectionKitStyles.checkDuration}>{report.activity.age}</Text>
          <ActivityRowKebab
            activity={report.activity}
            visible={actionsVisible}
            attachEnabled={attachEnabled}
            brandLabel={brandLabel}
            onMenuOpenChange={setMenuOpen}
            onAddToChat={onAddToChat}
          />
        </View>
      </PressHighlight>
    </View>
  );
}

function ConversationFold({
  count,
  commands,
  entries,
  renderTimelineEntry,
}: {
  count: number;
  commands: readonly PrCommandEntry[];
  entries: readonly PrTimelineEntry[];
  renderTimelineEntry: (entry: PrTimelineEntry) => ReactNode;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const handleToggle = useCallback(() => setOpen((value) => !value), []);
  return (
    <View>
      <PressHighlight
        onPress={handleToggle}
        style={rowPressableStyle}
        accessibilityRole="button"
        testID="pr-pane-status-conversation"
      >
        {open ? (
          <ThemedChevronDown size={12} uniProps={foregroundMutedColorMapping} />
        ) : (
          <ThemedChevronRight size={12} uniProps={foregroundMutedColorMapping} />
        )}
        <Text style={styles.groupLabelInline}>
          {t("workspace.git.pr.status.groups.conversation")}
        </Text>
        <View style={sectionKitStyles.checkTrailing}>
          <View style={styles.conversationCount}>
            <ThemedMessageSquare size={11} uniProps={foregroundMutedColorMapping} />
            <Text style={sectionKitStyles.checkDuration}>{count}</Text>
          </View>
        </View>
      </PressHighlight>
      {open ? (
        <View style={styles.conversationFold}>
          {commands.map((command) => (
            <View key={command.id} style={sectionKitStyles.checkRow}>
              <ThemedSquareSlash size={13} uniProps={foregroundMutedColorMapping} />
              <Text style={styles.roundText} numberOfLines={1}>
                {command.command}
                {command.count > 1 ? ` ×${command.count}` : ""}
              </Text>
              <View style={sectionKitStyles.checkTrailing}>
                <Text style={sectionKitStyles.checkDuration}>{command.latest.age}</Text>
              </View>
            </View>
          ))}
          {entries.map((entry) => renderTimelineEntry(entry))}
        </View>
      ) : null}
    </View>
  );
}

function ActivityRowKebab({
  activity,
  visible,
  attachEnabled,
  brandLabel,
  onMenuOpenChange,
  onAddToChat,
}: {
  activity: PrPaneActivity;
  visible: boolean;
  attachEnabled: boolean;
  brandLabel: string;
  onMenuOpenChange: (open: boolean) => void;
  onAddToChat: (activity: PrPaneActivity) => void;
}) {
  const { t } = useTranslation();
  const handleAddToChat = useCallback(() => onAddToChat(activity), [activity, onAddToChat]);
  const handleCopy = useCallback(() => {
    void writeMarkdownToRichClipboard(activity.body, getDefaultMarkdownClipboardEnvironment());
  }, [activity.body]);
  const handleOpen = useCallback(() => {
    void openExternalUrl(activity.url);
  }, [activity.url]);

  return (
    <View
      style={visible ? styles.kebabSlot : styles.kebabSlotHidden}
      pointerEvents={visible ? "auto" : "none"}
    >
      <DropdownMenu onOpenChange={onMenuOpenChange}>
        <DropdownMenuTrigger
          hitSlop={8}
          style={kebabTriggerStyle}
          accessibilityLabel={t("workspace.git.pr.accessibility.commentActions")}
        >
          {renderKebabTriggerIcon}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={200}>
          {attachEnabled && canAddPullRequestActivityToChat(activity) ? (
            <DropdownMenuItem leading={ADD_TO_CHAT_MENU_ICON} onSelect={handleAddToChat}>
              {t("workspace.git.pr.actions.addToChat")}
            </DropdownMenuItem>
          ) : null}
          {activity.body.trim() !== "" ? (
            <DropdownMenuItem leading={COPY_MENU_ICON} onSelect={handleCopy}>
              Copy
            </DropdownMenuItem>
          ) : null}
          {activity.url !== "" ? (
            <DropdownMenuItem leading={OPEN_MENU_ICON} onSelect={handleOpen}>
              {t("workspace.git.pr.actions.openOn", { brand: brandLabel })}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function renderKebabTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreHorizontal
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function kebabTriggerStyle({ hovered = false }: { hovered?: boolean }) {
  return [styles.kebabButton, hovered && styles.kebabButtonHovered];
}

function rowPressableStyle({ hovered }: { hovered?: boolean }) {
  return [sectionKitStyles.checkRow, Boolean(hovered) && styles.hoverable];
}

function roundPressableStyle({ hovered }: { hovered?: boolean }) {
  return [sectionKitStyles.checkRow, styles.roundRow, Boolean(hovered) && styles.hoverable];
}

const styles = StyleSheet.create((theme) => ({
  groupLabel: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[3],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  groupLabelInline: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  hoverable: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  roundsFold: {
    paddingBottom: theme.spacing[1],
  },
  roundRow: {
    paddingLeft: theme.spacing[6],
  },
  roundText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
    flexShrink: 1,
  },
  shaText: {
    fontSize: theme.fontSize.sm,
    fontFamily: theme.fontFamily.mono,
    color: theme.colors.foregroundMuted,
  },
  severityGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  severityBadge: {
    borderRadius: theme.borderRadius.base,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[1],
    paddingVertical: 1,
  },
  severityText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  foldThread: {
    paddingTop: theme.spacing[1],
  },
  conversationFold: {
    paddingTop: theme.spacing[1],
  },
  conversationCount: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  kebabSlot: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  kebabSlotHidden: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
  },
  kebabButton: {
    padding: 2,
    borderRadius: 4,
  },
  kebabButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
