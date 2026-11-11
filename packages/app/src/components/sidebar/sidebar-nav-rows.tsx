// Changed for Groupon Desk (fork of Paseo, Apache-2.0): "New chat" leads the sidebar header rows, set off by a line, unless the person hid it in Settings > Sidebar; New workspace never opens on a project-less chat's "No project". Every row past New chat and New workspace folds under one "More" row, folded by default (owner, 2026-11-11: the header took ten lines).
import { isChatsProjectRoot } from "@/groupon/project-less-chats";
import { router, usePathname } from "expo-router";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  History,
  Plus,
  Search,
} from "lucide-react-native";
import { memo, useCallback, useMemo, useRef, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { SidebarNewChatRow } from "@/groupon/new-chat-row";
import { useSettings } from "@/hooks/use-settings";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { PluginSidebarItem } from "@/plugins/sidebar-items";
import { canCreateWorktreeForProjectKind } from "@/projects/host-projects";
import { useHostFeature } from "@/runtime/host-features";
import {
  builtinSidebarNavLabelKey,
  builtinSidebarNavShortcutAction,
  type BuiltinSidebarNavId,
} from "@/sidebar-nav/model";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import type { SidebarNavItem } from "@/sidebar-nav/model";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import {
  buildNewWorkspaceRoute,
  buildSchedulesRoute,
  buildSessionsRoute,
} from "@/utils/host-routes";

interface SidebarNavRowProps {
  onBeforeNavigate?: () => void;
}

interface SidebarNavRowsProps extends SidebarNavRowProps {
  /** Style for the group wrapper, which the sidebar owns. */
  style?: StyleProp<ViewStyle>;
  /** Sits to the right of the first row, which shrinks to make room. */
  firstRowTrailing?: ReactNode;
}

/** The header rows that never fold under "More". */
const ALWAYS_SHOWN_HEADER_ROWS: ReadonlySet<string> = new Set(["new-workspace"]);

/**
 * Splits the visible header rows into those always shown and those folded under "More", each
 * keeping the order the person chose in Settings > Sidebar.
 */
export function partitionHeaderRows<T extends SidebarNavItem<"header">>(
  items: readonly T[],
): { shown: T[]; folded: T[] } {
  const shown: T[] = [];
  const folded: T[] = [];
  for (const item of items) {
    if (!item.visible) continue;
    if (item.kind === "builtin" && ALWAYS_SHOWN_HEADER_ROWS.has(item.id)) {
      shown.push(item);
    } else {
      folded.push(item);
    }
  }
  return { shown, folded };
}

/**
 * Top-level sidebar navigation: Groupon Desk's "New chat", then the rows ordered and filtered by
 * the user's `sidebarNavItems` preference. Only New workspace stays out; the rest fold under
 * "More". Folding hides rows only: their shortcuts and routes work folded too.
 */
export function SidebarNavRows({ style, onBeforeNavigate, firstRowTrailing }: SidebarNavRowsProps) {
  const { items } = useSidebarNavItems("header");
  const showNewChat = useSettings((settings) => settings.sidebarNewChatRow);
  const { shown, folded } = useMemo(() => partitionHeaderRows(items), [items]);
  const expanded = useSidebarViewStore((state) => state.headerRowsExpanded);
  const setExpanded = useSidebarViewStore((state) => state.setHeaderRowsExpanded);
  const groupRef = useRef<View | null>(null);

  const renderRow = (item: SidebarNavItem<"header">) => {
    if (item.kind === "plugin") {
      return (
        <PluginSidebarItem
          key={item.key}
          group={item.group}
          section="header"
          fallbackAnchorRef={groupRef}
          onBeforeNavigate={onBeforeNavigate}
        />
      );
    }
    const Row = BUILTIN_ROWS[item.id];
    return <Row key={item.key} onBeforeNavigate={onBeforeNavigate} />;
  };
  const rows = shown.map(renderRow);
  if (folded.length > 0) {
    rows.push(<SidebarMoreRow key="groupon-more" expanded={expanded} onToggle={setExpanded} />);
    if (expanded) rows.push(...folded.map(renderRow));
  }
  // Groupon Desk: "New chat" leads, set off from the rows the person orders; hidden, the trailing
  // control keeps the first line to itself.
  const firstRow = showNewChat ? <SidebarNewChatRow onBeforeNavigate={onBeforeNavigate} /> : null;

  return (
    <View ref={groupRef} collapsable={false} style={style}>
      {firstRowTrailing ? (
        <View style={styles.firstRow}>
          <View style={styles.firstRowItem}>{firstRow}</View>
          {firstRowTrailing}
        </View>
      ) : (
        firstRow
      )}
      {firstRow && rows.length > 0 ? <View style={styles.separator} /> : null}
      {rows}
    </View>
  );
}

function SidebarMoreRow({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onToggle(!expanded), [expanded, onToggle]);
  return (
    <SidebarHeaderRow
      icon={expanded ? ChevronDown : ChevronRight}
      label={t("sidebar.actions.more")}
      onPress={handlePress}
      testID="sidebar-header-more"
      variant="compact"
    />
  );
}

const SidebarNewWorkspaceRow = memo(function SidebarNewWorkspaceRow({
  onBeforeNavigate,
}: SidebarNavRowProps) {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys(builtinSidebarNavShortcutAction("new-workspace"));
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const activeWorkspaceServerId = activeWorkspaceSelection?.serverId ?? null;
  const activeWorkspaceId = activeWorkspaceSelection?.workspaceId ?? null;
  const activeWorkspace = useWorkspace(activeWorkspaceServerId, activeWorkspaceId);
  const supportsWorkspaceMultiplicity = useHostFeature(
    activeWorkspaceServerId,
    "workspaceMultiplicity",
  );
  // Groupon Desk: a chat without a project lends New workspace no project: "No project" is New chat's.
  const canUseActiveWorkspaceContext = Boolean(
    activeWorkspace &&
    !isChatsProjectRoot(activeWorkspace.projectRootPath) &&
    (supportsWorkspaceMultiplicity || canCreateWorktreeForProjectKind(activeWorkspace.projectKind)),
  );

  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(
      activeWorkspaceServerId
        ? buildNewWorkspaceRoute(
            activeWorkspace && canUseActiveWorkspaceContext
              ? {
                  serverId: activeWorkspaceServerId,
                  sourceDirectory: activeWorkspace.projectRootPath,
                  projectId: activeWorkspace.projectId,
                }
              : { serverId: activeWorkspaceServerId },
          )
        : buildNewWorkspaceRoute(),
    );
  }, [activeWorkspace, activeWorkspaceServerId, canUseActiveWorkspaceContext, onBeforeNavigate]);

  return (
    <SidebarHeaderRow
      icon={Plus}
      label={t(builtinSidebarNavLabelKey("new-workspace"))}
      onPress={handlePress}
      testID="sidebar-global-new-workspace"
      variant="compact"
      shortcutKeys={shortcutKeys}
    />
  );
});

function SidebarHistoryRow({ onBeforeNavigate }: SidebarNavRowProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(buildSessionsRoute());
  }, [onBeforeNavigate]);

  return (
    <SidebarHeaderRow
      icon={History}
      label={t(builtinSidebarNavLabelKey("history"))}
      onPress={handlePress}
      isActive={pathname.includes("/sessions")}
      testID="sidebar-sessions"
      variant="compact"
    />
  );
}

function SidebarSearchRow() {
  const { t } = useTranslation();
  const shortcutKeys = useShortcutKeys(builtinSidebarNavShortcutAction("search"));
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const handlePress = useCallback(() => {
    setCommandCenterOpen(true);
  }, [setCommandCenterOpen]);

  return (
    <SidebarHeaderRow
      icon={Search}
      label={t(builtinSidebarNavLabelKey("search"))}
      onPress={handlePress}
      testID="sidebar-search"
      variant="compact"
      shortcutKeys={shortcutKeys}
    />
  );
}

function SidebarSchedulesRow({ onBeforeNavigate }: SidebarNavRowProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const handlePress = useCallback(() => {
    onBeforeNavigate?.();
    router.push(buildSchedulesRoute());
  }, [onBeforeNavigate]);

  return (
    <SidebarHeaderRow
      icon={CalendarClock}
      label={t(builtinSidebarNavLabelKey("schedules"))}
      onPress={handlePress}
      isActive={pathname.includes("/schedules")}
      testID="sidebar-schedules"
      variant="compact"
    />
  );
}

const BUILTIN_ROWS: Record<BuiltinSidebarNavId, ComponentType<SidebarNavRowProps>> = {
  "new-workspace": SidebarNewWorkspaceRow,
  history: SidebarHistoryRow,
  search: SidebarSearchRow,
  schedules: SidebarSchedulesRow,
};

const styles = StyleSheet.create((theme) => ({
  firstRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  firstRowItem: {
    flex: 1,
    minWidth: 0,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1],
  },
}));
