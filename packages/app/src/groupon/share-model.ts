// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the window knows about shared workspaces, pure.

/**
 * Sharing a workspace with a colleague, as the window draws it (monorepo design
 * `_documentation/design/groupon-desk-work-window-design.md`, section 13):
 *
 * - the owner's side: who a workspace is shared with, and which hub workspace a Paseo workspace in
 *   the sidebar is (the same folder on the same Mac);
 * - the colleague's side: the "Shared with me" list, the share key out of the owner's box, a
 *   prompt sealed under it, and which permission requests still wait for an answer.
 *
 * Nothing here reaches the network or the keychain; the screens pass the overview and the keys in.
 */

import {
  base64ToBytes,
  openShareKeyBox,
  sealKeyFromShareKey,
  sealText,
  type DeskIdentity,
} from "./crypto";
import type { OpenedMessage } from "./history";
import type { HubOverview, HubShare, HubSharedWorkspace, HubWorkspace } from "./hub";

export interface SharedChatEntry {
  chatId: string;
  title: string;
  status: string;
  model: string;
}

export interface SharedWorkspaceEntry {
  shareId: string;
  workspaceId: string;
  name: string;
  ownerName: string;
  ownerEmail: string;
  role: "read" | "write";
  repositoryName: string;
  /** The owner's Mac has boxed the key for this person; until then nothing opens. */
  keyHandedOver: boolean;
  chats: SharedChatEntry[];
}

const newestFirst = (a: string | null, b: string | null) => (b ?? "").localeCompare(a ?? "");

/** "Shared with me": each shared workspace with its owner and chats, the most recently active first. */
export function sharedTree(overview: HubOverview): SharedWorkspaceEntry[] {
  return [...(overview.sharedWithMe ?? [])]
    .sort((a, b) => newestFirst(a.workspace.updatedAt, b.workspace.updatedAt))
    .map((entry) => ({
      shareId: entry.shareId,
      workspaceId: entry.workspace.id,
      name: entry.workspace.ticketKey
        ? `${entry.workspace.ticketKey} · ${entry.workspace.name}`
        : entry.workspace.name,
      ownerName: entry.owner.name,
      ownerEmail: entry.owner.email,
      role: entry.role,
      repositoryName: entry.repositoryName,
      keyHandedOver: entry.sealedShareKey !== null && entry.shareKeyVersion !== null,
      chats: [...entry.chats]
        .sort((a, b) => newestFirst(a.lastMessageAt ?? a.createdAt, b.lastMessageAt ?? b.createdAt))
        .map((chat) => ({
          chatId: chat.id,
          title: chat.title?.trim() || `${chat.agent} · ${chat.model}`,
          status: chat.status,
          model: chat.model,
        })),
    }));
}

/** Who one of the person's workspaces is shared with now. */
export function sharesOfWorkspace(overview: HubOverview, workspaceId: string): HubShare[] {
  return (overview.shares ?? []).filter((share) => share.workspaceId === workspaceId);
}

/** The hub workspace behind a Paseo workspace: the same folder (a worktree's path is unique on a Mac). */
export function hubWorkspaceForPath(overview: HubOverview, path: string): HubWorkspace | null {
  const wanted = path.replace(/\/+$/, "");
  return (
    overview.workspaces.find(
      (workspace) =>
        workspace.state !== "archived" && (workspace.path ?? "").replace(/\/+$/, "") === wanted,
    ) ?? null
  );
}

/** The shared workspace a chat belongs to, when a colleague shared it with the person. */
export function sharedWorkspaceOfChat(
  overview: HubOverview,
  chatId: string,
): HubSharedWorkspace | null {
  return (
    (overview.sharedWithMe ?? []).find((entry) => entry.chats.some((chat) => chat.id === chatId)) ??
    null
  );
}

export type SharedKey =
  | { ok: true; sealKey: Uint8Array; version: number }
  | { ok: false; why: string };

/** The share key out of the owner's box, as the seal key that opens and seals the shared copies. */
export function sharedKeyOf(entry: HubSharedWorkspace, identity: DeskIdentity | null): SharedKey {
  if (!identity) return { ok: false, why: "Open your vault on this device first." };
  if (
    entry.sealedShareKey === null ||
    entry.shareKeyVersion === null ||
    entry.owner.publicKey === null
  ) {
    return {
      ok: false,
      why: `${entry.owner.name}'s Mac has not handed over this workspace's key yet. It does as soon as its Groupon Desk runs.`,
    };
  }
  const key = openShareKeyBox(
    entry.sealedShareKey,
    entry.workspace.id,
    entry.shareKeyVersion,
    base64ToBytes(entry.owner.publicKey),
    identity,
  );
  if (key === null) {
    return {
      ok: false,
      why: "This workspace's key does not open with your vault key. If you changed your vault passphrase, ask the owner to share it again.",
    };
  }
  return { ok: true, sealKey: sealKeyFromShareKey(key), version: entry.shareKeyVersion };
}

/**
 * A prompt as the owner's hand opens it: the hand's message body, sealed for the chat, with the
 * device it was written on (the hand names it as the author's device; who wrote it is the hub's word).
 */
export function sealPrompt(
  text: string,
  chatId: string,
  sealKey: Uint8Array,
  device?: string,
): string {
  return sealText(
    JSON.stringify({ v: 1, kind: "message", role: "user", text, ...(device ? { device } : {}) }),
    chatId,
    "message",
    sealKey,
  );
}

/** The permission requests no answer has followed yet, oldest first: what a writer may still allow or deny. */
export function openPermissionRequests(
  messages: readonly OpenedMessage[],
): { requestId: string; toolName: string }[] {
  const answered = new Set<string>();
  for (const message of messages) {
    if (message.body?.kind === "permission_answer") answered.add(message.body.requestId);
  }
  const open: { requestId: string; toolName: string }[] = [];
  for (const message of messages) {
    if (message.body?.kind === "permission_request" && !answered.has(message.body.requestId)) {
      open.push({ requestId: message.body.requestId, toolName: message.body.toolName });
    }
  }
  return open;
}

/** A typed email address, trimmed and lowercased, or null when it is not one. */
export function normaliseEmail(text: string): string | null {
  const email = text.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}
