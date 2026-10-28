// Changed for Groupon Desk (fork of Paseo, Apache-2.0): when the count grows, what it grew by bursts above the pill and is drawn into it (groupon/diff-burst). The pill names the comparison it counts and switches it from the Changes panel's menu.
import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable } from "react-native";
import { useTranslation } from "react-i18next";
import { DiffStat } from "@/components/diff-stat";
import { composerPillStyles } from "@/composer/pill-styles";
import { useVisibleWorkspaceDiffStat } from "@/composer/workspace-diff-stat";
import { DiffBurst } from "@/groupon/diff-burst";
import { DiffModeMenu } from "@/git/diff-pane";
import { useWorkingDiffComparison } from "@/git/working-diff-comparison";
import { sessionComparisonOf, type SessionChangesMode } from "@/git/working-diff-comparison/state";

interface ComposerDiffStatPillProps {
  additions: number;
  deletions: number;
  onPress: () => void;
  /** Groupon Desk: what the count belongs to; a growing count bursts above the pill within it. */
  burstScope?: string;
  /** Groupon Desk: the comparison the count reads, with the Changes panel's menu to switch it. */
  modeMenu?: ReactElement | null;
}

export function ComposerDiffStatPill({
  additions,
  deletions,
  onPress,
  burstScope,
  modeMenu,
}: ComposerDiffStatPillProps) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => setIsHovered(false), []);
  const bodyStyle = useMemo(
    () => [composerPillStyles.body, isHovered && composerPillStyles.bodyActive],
    [isHovered],
  );

  return (
    <Pressable
      testID="composer-diff-stat-pill"
      accessibilityRole="button"
      accessibilityLabel={t("workspace.git.diff.openChangesTab")}
      onPress={onPress}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={bodyStyle}
    >
      <DiffStat additions={additions} deletions={deletions} />
      {burstScope ? (
        <DiffBurst additions={additions} deletions={deletions} scope={burstScope} />
      ) : null}
      {modeMenu ?? null}
    </Pressable>
  );
}

export const WorkspaceDiffStatPill = memo(function WorkspaceDiffStatPill({
  serverId,
  workspaceId,
  onPress,
}: {
  serverId: string;
  workspaceId: string;
  onPress: () => void;
}): ReactElement | null {
  const diffStat = useVisibleWorkspaceDiffStat(serverId, workspaceId);
  const modeMenu = useMemo(
    () => <WorkspaceDiffModeMenu serverId={serverId} workspaceId={workspaceId} />,
    [serverId, workspaceId],
  );
  if (!diffStat) {
    return null;
  }
  return (
    <ComposerDiffStatPill
      additions={diffStat.additions}
      deletions={diffStat.deletions}
      onPress={onPress}
      burstScope={`${serverId}:${workspaceId}`}
      modeMenu={modeMenu}
    />
  );
});

/** Groupon Desk: the comparison the pill counts, switched from the same menu as the Changes panel's. */
function WorkspaceDiffModeMenu({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}) {
  const { comparison, selectComparison } = useWorkingDiffComparison({
    serverId,
    workspaceId,
    cwd: "",
  });
  const selectAll = useCallback(() => selectComparison("all"), [selectComparison]);
  const selectBase = useCallback(() => selectComparison("base"), [selectComparison]);
  const selectUncommitted = useCallback(() => selectComparison("uncommitted"), [selectComparison]);
  const selectSession = useCallback(
    (mode: SessionChangesMode = "all") => selectComparison(sessionComparisonOf(mode)),
    [selectComparison],
  );
  return (
    <DiffModeMenu
      diffMode={comparison}
      testIDPrefix="composer-diff"
      onSelectAll={selectAll}
      onSelectBase={selectBase}
      onSelectUncommitted={selectUncommitted}
      onSelectSession={selectSession}
    />
  );
}
