// Added for Groupon Desk (fork of Paseo, Apache-2.0): who is in this workspace now, above the composer.
import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { Laptop, Share2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { composerPillStyles } from "@/composer/pill-styles";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getIsElectronRuntime } from "@/constants/layout";
import { useFetchQuery } from "@/data/query";
import { useWorkspaceDirectory } from "@/stores/session-store-hooks";
import type { Theme } from "@/styles/theme";
import { checkInPresence, fetchOverview, type HubOverview, type HubWorkspacePresence } from "./hub";
import { useHubMachinesStore } from "./hub-sync";
import {
  deviceName,
  PRESENCE_POLL_MS,
  presenceView,
  type PresenceChip,
  type PresenceView,
} from "./presence-model";
import { useGrouponStore } from "./session";
import { hubWorkspaceForDaemon } from "./share-model";
import { hubShareRoute } from "./share-route";
import { GROUPON_PRESENCE } from "./strings";

/** The overview only maps a Paseo workspace to its hub workspace here; a minute old is fresh enough. */
const OVERVIEW_STALE_MS = 60_000;
/** How often the overview is re-read while the open workspace is not on the hub yet. */
const NOT_YET_MIRRORED_POLL_MS = 15_000;

const ThemedLaptop = withUnistyles(Laptop);
const ThemedShare = withUnistyles(Share2);
const mutedColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * Check in to a hub workspace every 15 s while it is on screen, and read who else is in it. One
 * query per workspace: the composer row and the Share screen share its answer.
 */
export function useHubPresence(hubWorkspaceId: string | null) {
  const ready = useGrouponStore((state) => state.status === "ready");
  return useFetchQuery<HubWorkspacePresence>({
    queryKey: ["groupon-presence", hubWorkspaceId],
    queryFn: async () => {
      if (!hubWorkspaceId) throw new Error("No hub workspace to check in to.");
      const device = deviceName(Platform.OS, getIsElectronRuntime());
      return (await checkInPresence(hubWorkspaceId, device)).presence;
    },
    enabled: ready && hubWorkspaceId !== null,
    dataShape: "value",
    retry: false,
    staleTimeMs: PRESENCE_POLL_MS,
    refetchInterval: PRESENCE_POLL_MS,
  });
}

/** The hub's Macs the window reached at one daemon `serverId` (Your Macs' list): that daemon's Mac. */
export function useHubMachinesOfServer(serverId: string | null | undefined): readonly string[] {
  const views = useHubMachinesStore((state) => state.machines);
  return useMemo(
    () =>
      serverId
        ? views.filter((view) => view.serverId === serverId).map((view) => view.machine.machine)
        : [],
    [serverId, views],
  );
}

/**
 * The hub workspace behind a Paseo workspace, by its daemon ids, else its folder on that Mac
 * (`hubWorkspaceForDaemon`). While the hub has not heard of it yet (a workspace made a moment ago,
 * which the Mac's hand mirrors within half a minute) the overview is re-read every 15 s.
 */
export function useHubWorkspaceForDaemon(serverId: string, workspaceId: string): string | null {
  const ready = useGrouponStore((state) => state.status === "ready");
  const directory = useWorkspaceDirectory(serverId, workspaceId);
  const machines = useHubMachinesOfServer(serverId);
  const find = useCallback(
    (overview: HubOverview) =>
      hubWorkspaceForDaemon(overview, serverId, workspaceId, directory, machines),
    [directory, machines, serverId, workspaceId],
  );
  const overview = useFetchQuery({
    queryKey: ["groupon-hub-overview"],
    queryFn: fetchOverview,
    enabled: ready && workspaceId.length > 0,
    dataShape: "value",
    retry: false,
    staleTimeMs: OVERVIEW_STALE_MS,
    refetchInterval: (query) =>
      query.state.data && find(query.state.data) ? false : NOT_YET_MIRRORED_POLL_MS,
  });
  return overview.data ? (find(overview.data)?.id ?? null) : null;
}

/** The presence of a Paseo workspace: its hub workspace (`useHubWorkspaceForDaemon`), as its owner sees it. */
export function usePaseoWorkspacePresence(
  serverId: string,
  workspaceId: string,
): { hubWorkspaceId: string | null; view: PresenceView } {
  const hubWorkspaceId = useHubWorkspaceForDaemon(serverId, workspaceId);
  const presence = useHubPresence(hubWorkspaceId);
  return { hubWorkspaceId, view: presenceView(presence.data, "owner") };
}

/** Whether the row draws anything: the composer's track bar makes room only then. */
export function presenceVisible(view: PresenceView): boolean {
  return view.kind !== "hidden";
}

/**
 * The row: initials chips (you ringed) and the Mac, each with its tooltip, or a Share chip when
 * only the owner is in. Any chip opens Share for the workspace when `hubWorkspaceId` is given.
 */
export const PresenceRow = memo(function PresenceRow({
  view,
  hubWorkspaceId,
}: {
  view: PresenceView;
  hubWorkspaceId: string | null;
}): ReactElement | null {
  const openShare = useCallback(() => {
    if (hubWorkspaceId) router.push(hubShareRoute({ workspaceId: hubWorkspaceId }));
  }, [hubWorkspaceId]);
  const canShare = hubWorkspaceId !== null;
  if (view.kind === "hidden") return null;
  if (view.kind === "share") {
    if (!canShare) return null;
    return (
      <View style={[composerPillStyles.body, styles.apart]} testID="groupon-presence-share">
        <Tooltip delayDuration={250} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger
            onPress={openShare}
            accessibilityRole="button"
            accessibilityLabel={GROUPON_PRESENCE.shareChipLabel}
            style={styles.shareTrigger}
          >
            <ThemedShare size={14} uniProps={mutedColor} />
            <Text style={composerPillStyles.label}>{GROUPON_PRESENCE.shareChip}</Text>
          </TooltipTrigger>
          <TooltipContent side="top" align="center" offset={8}>
            <Text style={styles.tooltipText}>{GROUPON_PRESENCE.shareChipLabel}</Text>
          </TooltipContent>
        </Tooltip>
      </View>
    );
  }
  return (
    <View
      style={[composerPillStyles.body, styles.row, styles.apart]}
      accessibilityLabel={view.label}
      testID="groupon-presence-row"
    >
      {view.chips.map((chip) => (
        <Chip key={chip.key} chip={chip} onPress={canShare ? openShare : undefined} />
      ))}
    </View>
  );
});

function Chip({ chip, onPress }: { chip: PresenceChip; onPress?: () => void }): ReactElement {
  return (
    <Tooltip delayDuration={150} enabledOnDesktop enabledOnMobile>
      <TooltipTrigger
        onPress={onPress}
        accessibilityRole={onPress ? "button" : "text"}
        accessibilityLabel={chip.tooltip}
        style={[styles.chip, chip.you && styles.chipYou]}
        testID={`groupon-presence-chip-${chip.kind}`}
      >
        {chip.kind === "hand" ? (
          <ThemedLaptop size={12} uniProps={mutedColor} />
        ) : (
          <Text style={styles.initials}>{chip.initials}</Text>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{chip.tooltip}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const CHIP_SIZE = 22;

const styles = StyleSheet.create((theme) => ({
  row: { gap: theme.spacing[1], paddingHorizontal: theme.spacing[2] },
  // Share and the people in the room stand apart from the agent's own pills after them.
  apart: { marginRight: theme.spacing[2] },
  shareTrigger: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
  chip: {
    width: CHIP_SIZE,
    height: CHIP_SIZE,
    borderRadius: CHIP_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  chipYou: { borderColor: theme.colors.foreground },
  initials: {
    fontSize: 10,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  tooltipText: { fontSize: theme.fontSize.sm, color: theme.colors.foreground },
}));
