// Added for Groupon Desk (fork of Paseo, Apache-2.0): who is in this workspace now, above the composer.
import { memo, useCallback, type ReactElement } from "react";
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
import { checkInPresence, fetchOverview, type HubWorkspacePresence } from "./hub";
import {
  deviceName,
  PRESENCE_POLL_MS,
  presenceView,
  type PresenceChip,
  type PresenceView,
} from "./presence-model";
import { useGrouponStore } from "./session";
import { hubWorkspaceForPath } from "./share-model";
import { hubShareRoute } from "./share-route";
import { GROUPON_PRESENCE } from "./strings";

/** The overview only maps a Paseo workspace to its hub workspace here; a minute old is fresh enough. */
const OVERVIEW_STALE_MS = 60_000;

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

/** The presence of a Paseo workspace: the hub workspace in the same folder, as its owner sees it. */
export function usePaseoWorkspacePresence(
  serverId: string,
  workspaceId: string,
): { hubWorkspaceId: string | null; view: PresenceView } {
  const ready = useGrouponStore((state) => state.status === "ready");
  const directory = useWorkspaceDirectory(serverId, workspaceId);
  const overview = useFetchQuery({
    queryKey: ["groupon-hub-overview"],
    queryFn: fetchOverview,
    enabled: ready && Boolean(directory),
    dataShape: "value",
    retry: false,
    staleTimeMs: OVERVIEW_STALE_MS,
  });
  const hubWorkspaceId =
    overview.data && directory ? (hubWorkspaceForPath(overview.data, directory)?.id ?? null) : null;
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
      <View style={composerPillStyles.body} testID="groupon-presence-share">
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
      style={[composerPillStyles.body, styles.row]}
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
