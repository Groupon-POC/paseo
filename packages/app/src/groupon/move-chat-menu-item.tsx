// Added for Groupon Desk (fork of Paseo, Apache-2.0): "Move to project" on a chat without a project in the sidebar, a submenu of the Mac's projects.
import { router } from "expo-router";
import { FolderInput } from "lucide-react-native";
import { useCallback, useMemo, useState, type ReactElement } from "react";
import { withUnistyles } from "react-native-unistyles";
import {
  MenuHint,
  MenuItem,
  MenuSubTrigger,
  useMenuContext,
  type MenuPageDefinition,
} from "@/components/ui/menu";
import { useHostProjects } from "@/projects/host-projects";
import { getHostRuntimeStore, useHostRuntimeClient } from "@/runtime/host-runtime";
import { normalizeWorkspaceDescriptor, useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { buildHostWorkspaceRoute } from "@/utils/host-routes";
import {
  isChatsProjectRoot,
  isProjectLessChatDirectory,
  moveChatIntoProject,
} from "./project-less-chats";
import { GROUPON_CHATS } from "./strings";

const MOVE_CHAT_PAGE_ID = "groupon-move-chat";
const NO_PAGES: readonly MenuPageDefinition[] = [];

const ThemedFolderInput = withUnistyles(FolderInput);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const leadingIcon = <ThemedFolderInput size={14} uniProps={foregroundMutedColorMapping} />;

interface MoveChatTarget {
  serverId?: string | null;
  workspaceId?: string | null;
  path?: string | null;
}

interface MoveOption {
  key: string;
  name: string;
  rootPath: string;
  projectId: string;
  canWorktree: boolean;
}

function isMovableChat(
  target: MoveChatTarget,
): target is { serverId: string; workspaceId: string } {
  return Boolean(target.serverId && target.workspaceId && isProjectLessChatDirectory(target.path));
}

export function MoveChatMenuItem({ testID, ...target }: MoveChatTarget & { testID: string }) {
  if (!isMovableChat(target)) return null;
  return (
    <MenuSubTrigger id={MOVE_CHAT_PAGE_ID} leading={leadingIcon} testID={testID}>
      {GROUPON_CHATS.moveToProject}
    </MenuSubTrigger>
  );
}

/** The submenu page behind "Move to project"; none for a workspace that is not such a chat. */
export function useMoveChatMenuPages({
  serverId,
  workspaceId,
  path,
}: MoveChatTarget): readonly MenuPageDefinition[] {
  return useMemo(() => {
    if (!isMovableChat({ serverId, workspaceId, path })) return NO_PAGES;
    return [
      {
        id: MOVE_CHAT_PAGE_ID,
        title: GROUPON_CHATS.moveToProject,
        content: <MoveChatPage serverId={serverId as string} workspaceId={workspaceId as string} />,
      },
    ];
  }, [path, serverId, workspaceId]);
}

function MoveChatPage({
  serverId,
  workspaceId,
}: {
  serverId: string;
  workspaceId: string;
}): ReactElement {
  const client = useHostRuntimeClient(serverId);
  const serverIds = useMemo(() => [serverId], [serverId]);
  const projects = useHostProjects(serverIds);
  const agents = useSessionStore((state) => state.sessions[serverId]?.agents);
  const { setOpen } = useMenuContext("MoveChatPage");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<MoveOption[]>(
    () =>
      projects.flatMap((project) => {
        const host = project.hosts.find((placement) => placement.serverId === serverId);
        if (!host || isChatsProjectRoot(host.iconWorkingDir)) return [];
        return [
          {
            key: project.viewKey,
            name: project.projectName,
            rootPath: host.iconWorkingDir,
            projectId: host.projectId,
            canWorktree: host.worktreeSupport === "supported",
          },
        ];
      }),
    [projects, serverId],
  );
  const agentIds = useMemo(
    () =>
      Array.from(agents?.values() ?? [])
        .filter((agent) => agent.workspaceId === workspaceId && !agent.archivedAt)
        .map((agent) => agent.id),
    [agents, workspaceId],
  );

  const move = useCallback(
    async (option: MoveOption) => {
      if (!client || pendingKey) return;
      setPendingKey(option.key);
      setError(null);
      // A worktree always; a folder that is not a repository can only take the chat as it is.
      const isolation = option.canWorktree ? "worktree" : "local";
      try {
        const workspace = await moveChatIntoProject({
          client,
          chatWorkspaceId: workspaceId,
          agentIds,
          target: { projectId: option.projectId, rootPath: option.rootPath, isolation },
          idempotencyKey: `chat-move-${workspaceId}-${option.projectId}-${isolation}`,
        });
        getHostRuntimeStore().acceptWorkspaceSnapshots(serverId, [
          normalizeWorkspaceDescriptor(workspace),
        ]);
        setOpen(false);
        router.replace(buildHostWorkspaceRoute(serverId, workspace.id));
      } catch (moveError) {
        setError(moveError instanceof Error ? moveError.message : GROUPON_CHATS.moveFailed);
        setPendingKey(null);
      }
    },
    [agentIds, client, pendingKey, serverId, setOpen, workspaceId],
  );

  return (
    <>
      {options.map((option) => (
        <MoveOptionItem key={option.key} option={option} pendingKey={pendingKey} onMove={move} />
      ))}
      {error ? <MenuHint>{error}</MenuHint> : null}
    </>
  );
}

function MoveOptionItem({
  option,
  pendingKey,
  onMove,
}: {
  option: MoveOption;
  pendingKey: string | null;
  onMove: (option: MoveOption) => Promise<void>;
}) {
  const select = useCallback(() => void onMove(option), [onMove, option]);
  const isPending = pendingKey === option.key;
  return (
    <MenuItem
      testID={`chat-move-project-${option.key}`}
      closeOnSelect={false}
      disabled={pendingKey !== null && !isPending}
      status={isPending ? "pending" : undefined}
      pendingLabel={GROUPON_CHATS.moving}
      onSelect={select}
    >
      {option.name}
    </MenuItem>
  );
}
