// Added for Groupon Desk (fork of Paseo, Apache-2.0): who wrote a user message, and how the chat draws it, pure.

/**
 * The three looks of a chat (the owner's word of 2026-10-21: "which user wrote what, like in a
 * chat app"): the signed-in person's own prompts in today's bubble, a colleague's in a second tint
 * with a name chip, the agent's answers as today. A prompt's author rides on Paseo's user_message
 * (`author`, set by the window from its signed-in person and by the hand for a hub prompt); in the
 * History reader it is the hub's `senderUserId`.
 *
 * Nothing here reaches the network, the store or the theme object; the components pass them in.
 */

import type { UserMessageAuthor } from "@getpaseo/protocol/agent-types";
import type { HubMessage, HubOverview } from "./hub";
import { GROUPON_AUTHOR } from "./strings";

export type MessageLook =
  | { kind: "mine" }
  | { kind: "colleague"; chip: string; accessibilityLabel: string };

export interface MessageLookInput {
  author: UserMessageAuthor | null | undefined;
  /** The signed-in person's user id; null before the gate knows it. */
  viewerUserId: string | null;
  /** Whether the person looking owns the workspace: a message with no author is then theirs. */
  viewerOwnsWorkspace: boolean;
  /** The owner's name, for a colleague reading a message with no author. */
  ownerName?: string | null;
}

function colleagueLook(name: string, device: string | null): MessageLook {
  const chip = GROUPON_AUTHOR.chip(name, device);
  return { kind: "colleague", chip, accessibilityLabel: GROUPON_AUTHOR.chipLabel(chip) };
}

/**
 * Mine when the author is the person looking, or when there is no author and the person owns the
 * workspace (every message from before authors was the owner's); anyone else's carries a chip.
 */
export function messageLook(input: MessageLookInput): MessageLook {
  const { author, viewerUserId } = input;
  if (!author) {
    if (input.viewerOwnsWorkspace) return { kind: "mine" };
    return colleagueLook(input.ownerName?.trim() || GROUPON_AUTHOR.someone, null);
  }
  if (viewerUserId !== null && author.userId === viewerUserId) return { kind: "mine" };
  return colleagueLook(
    author.name.trim() || GROUPON_AUTHOR.colleague,
    author.device?.trim() || null,
  );
}

/** The author of a prompt this window sends: the signed-in person, on this device; null when signed out. */
export function authorOfViewer(
  identity: { userId: string | null; name: string | null; email: string | null } | null,
  device: string,
): UserMessageAuthor | null {
  if (!identity?.userId) return null;
  const name = identity.name?.trim() || identity.email?.trim() || "";
  return { userId: identity.userId, name, device };
}

/** The names the window knows by user id: the people a workspace is shared with, and the owners who shared one. */
export function knownNames(overview: HubOverview | null): Map<string, string> {
  const names = new Map<string, string>();
  for (const share of overview?.shares ?? []) names.set(share.grantee.userId, share.grantee.name);
  for (const entry of overview?.sharedWithMe ?? []) names.set(entry.owner.userId, entry.owner.name);
  return names;
}

/**
 * The author of a prompt in the hub's transcript: the colleague the hub names (`senderUserId`),
 * with the device their window sealed into the prompt, else the workspace's owner. The owner is
 * given as null when the person reading is the owner, so the message reads as theirs.
 */
export function authorOfHubMessage(
  row: Pick<HubMessage, "senderUserId">,
  device: string | undefined,
  owner: { userId: string; name: string } | null,
  names: ReadonlyMap<string, string>,
): UserMessageAuthor | null {
  const sender = row.senderUserId ?? null;
  if (sender === null) return owner ? { userId: owner.userId, name: owner.name } : null;
  return { userId: sender, name: names.get(sender) ?? "", ...(device ? { device } : {}) };
}

/**
 * A theme colour at an opacity (as `rgba()`, which every renderer takes), for a tint drawn over
 * the chat's surface; a colour that is not `#rrggbb` (a custom theme's named colour, an rgba) comes back as it was.
 */
export function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  const channel = (at: number) => Number.parseInt(color.slice(at, at + 2), 16);
  const opacity = Math.round(Math.min(1, Math.max(0, alpha)) * 100) / 100;
  return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${opacity})`;
}
