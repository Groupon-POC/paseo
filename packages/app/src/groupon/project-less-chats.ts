// Added for Groupon Desk (fork of Paseo, Apache-2.0): the window's side of chats started without a project.

/**
 * "New chat" opens New workspace on the "No project" project, whose root holds a folder per chat
 * (`<PASEO_HOME>/chats`, `packages/server/src/groupon/project-less-chats.ts`). When such a chat is
 * created, the daemon places it by its first message: in a project it names (Local, or a worktree
 * when it will change files) or in a folder of its own. A chat left without a project can be moved
 * into one later, conversation included.
 */

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { z } from "zod";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const CHATS_RPC = {
  ensure: "groupon-desk.chats.ensure",
  place: "groupon-desk.chats.place",
  move: "groupon-desk.chats.move",
} as const;

type RpcClient = Pick<DaemonClient, "invokePluginRpc">;

const ChatsProjectSchema = z.object({ projectId: z.string(), rootPath: z.string() });
export type ChatsProject = z.infer<typeof ChatsProjectSchema>;

const ChatPlacementSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    projectId: z.string(),
    rootPath: z.string(),
    isolation: z.enum(["local", "worktree"]),
    reason: z.string(),
  }),
  z.object({ kind: z.literal("chat"), projectId: z.string(), path: z.string() }),
]);
export type ChatPlacement = z.infer<typeof ChatPlacementSchema>;

/** The hand's home is `~/.groupon/paseo`; Paseo's own is `~/.paseo`. */
const CHATS_ROOT_PATTERN = /[/\\](?:\.groupon[/\\]paseo|\.paseo)[/\\]chats[/\\]?$/;
const CHAT_FOLDER_PATTERN = /[/\\](?:\.groupon[/\\]paseo|\.paseo)[/\\]chats[/\\][^/\\]+/;

export function isChatsProjectRoot(path: string | null | undefined): boolean {
  return Boolean(path && CHATS_ROOT_PATTERN.test(path));
}

/** The "No project" project, which only New chat opens: never a default or a remembered pick of New workspace. */
export function isChatsProject(
  project:
    | { iconWorkingDir: string; hosts: readonly { iconWorkingDir: string }[] }
    | null
    | undefined,
): boolean {
  if (!project) return false;
  return (
    isChatsProjectRoot(project.iconWorkingDir) ||
    project.hosts.some((host) => isChatsProjectRoot(host.iconWorkingDir))
  );
}

/** A workspace that runs in a chat's own folder: a chat that has no project yet. */
export function isProjectLessChatDirectory(path: string | null | undefined): boolean {
  return Boolean(path && CHAT_FOLDER_PATTERN.test(path));
}

export async function ensureChatsProject(client: RpcClient): Promise<ChatsProject> {
  return ChatsProjectSchema.parse(
    await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, CHATS_RPC.ensure, {}),
  );
}

export async function placeChat(client: RpcClient, prompt: string): Promise<ChatPlacement> {
  const output = z
    .object({ placement: ChatPlacementSchema })
    .parse(await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, CHATS_RPC.place, { prompt }));
  return output.placement;
}

export async function moveChatAgent(
  client: RpcClient,
  input: { agentId: string; targetWorkspaceId: string },
): Promise<string> {
  const output = z
    .object({ agentId: z.string() })
    .parse(await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, CHATS_RPC.move, input));
  return output.agentId;
}

export interface ChatCreationTarget {
  projectId: string;
  sourceDirectory: string;
  isolation: "local" | "worktree";
}

/** Where a chat is created once the daemon placed it. */
export function chatCreationTarget(placement: ChatPlacement): ChatCreationTarget {
  return placement.kind === "project"
    ? {
        projectId: placement.projectId,
        sourceDirectory: placement.rootPath,
        isolation: placement.isolation,
      }
    : { projectId: placement.projectId, sourceDirectory: placement.path, isolation: "local" };
}

/** The first agent's request, running in `cwd` instead of the folder New workspace was opened on. */
export function withAgentCwd<T extends { cwd?: string; config?: { cwd: string } }>(
  agent: T,
  cwd: string,
): T {
  return {
    ...agent,
    ...(agent.config ? { config: { ...agent.config, cwd } } : {}),
    ...(agent.cwd ? { cwd } : {}),
  };
}

/** "No project" leads the sidebar while it holds a chat, and is not shown at all when empty. */
export function arrangeChatsProject<T extends { iconWorkingDir: string; workspaces: unknown[] }>(
  projects: T[],
): T[] {
  const chats = projects.filter((project) => isChatsProjectRoot(project.iconWorkingDir));
  if (chats.length === 0) return projects;
  const others = projects.filter((project) => !isChatsProjectRoot(project.iconWorkingDir));
  return [...chats.filter((project) => project.workspaces.length > 0), ...others];
}

export interface ChatMoveTarget {
  projectId: string;
  rootPath: string;
  isolation: "local" | "worktree";
}

type MoveClient = Pick<DaemonClient, "invokePluginRpc" | "createWorkspace" | "archiveWorkspace">;

/**
 * Moves a chat into a project: a workspace there, the chat's conversations continued in it, the
 * chat's own workspace (and folder) archived. Answers the new workspace's descriptor.
 */
export async function moveChatIntoProject(input: {
  client: MoveClient;
  chatWorkspaceId: string;
  agentIds: string[];
  target: ChatMoveTarget;
  idempotencyKey: string;
}) {
  if (input.agentIds.length === 0) throw new Error("The chat has no conversation to move yet");
  const { projectId, rootPath, isolation } = input.target;
  const payload = await input.client.createWorkspace({
    idempotencyKey: input.idempotencyKey,
    source:
      isolation === "worktree"
        ? { kind: "worktree", cwd: rootPath, projectId }
        : { kind: "directory", path: rootPath, projectId },
  });
  if (payload.error || !payload.workspace) {
    throw new Error(payload.error ?? "The project's workspace could not be created");
  }
  for (const agentId of input.agentIds) {
    await moveChatAgent(input.client, { agentId, targetWorkspaceId: payload.workspace.id });
  }
  await input.client.archiveWorkspace(input.chatWorkspaceId);
  return payload.workspace;
}
