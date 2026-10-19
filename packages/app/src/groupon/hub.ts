// Added for Groupon Desk (fork of Paseo, Apache-2.0): the hub's reads, typed as Core answers them.

/**
 * The hub is Groupon Desk's server side on Core (`user/groupon_desk`, monorepo
 * `.context/work-window/hub-spec.md`): the person's Macs, the registry of repositories,
 * workspaces and chats, and the sealed transcript store. Dates arrive as ISO strings.
 */

import { grouponRequest } from "./session";

export interface HubMachine {
  machine: string;
  name: string;
  model: string | null;
  alias: string | null;
  isPrimary: boolean;
  lastSeenAt: string;
  relaySessionId: string | null;
  relayConnectedAt: string | null;
  relayOfferSealed: string | null;
}

export interface HubRepository {
  id: string;
  remoteUrl: string;
  name: string;
  hidden: boolean;
  displayOrder: number;
}

export interface HubWorkspace {
  id: string;
  machine: string;
  repositoryId: string;
  branch: string | null;
  targetBranch: string;
  ticketKey: string | null;
  name: string;
  state: "creating" | "ready" | "archiving" | "archived" | "failed";
  status: "idle" | "working" | "waiting" | "unread";
  pinnedAt: string | null;
  prUrl: string | null;
  diffAdded: number | null;
  diffRemoved: number | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface HubChat {
  id: string;
  workspaceId: string;
  machine: string;
  agent: string;
  title: string | null;
  model: string;
  effort: string | null;
  status: string;
  unreadCount: number;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface HubMessage {
  id: string;
  chatId: string;
  seq: number;
  role: "user" | "assistant" | "system";
  kind: string;
  envelope: string;
  costUsd: number | null;
  senderMachine: string | null;
  createdAt: string;
}

export interface HubOverview {
  repositories: HubRepository[];
  workspaces: HubWorkspace[];
  chats: HubChat[];
  machines: HubMachine[];
}

/** The seal's kind for a Mac's Paseo pairing offer; its scope is the Mac's id (the hand's `relay.ts`). */
export const PAIRING_OFFER_KIND = "paseo_offer";
/** The hub's page ceiling for a chat's messages (`DESK_WORK_MESSAGES_PAGE_MAX`). */
export const MESSAGES_PAGE_MAX = 500;

export function fetchMachines(): Promise<{ machines: HubMachine[] }> {
  return grouponRequest("/user/groupon_desk/machines");
}

export function fetchOverview(): Promise<HubOverview> {
  return grouponRequest("/user/groupon_desk/work/overview");
}

export function fetchMessages(
  chatId: string,
  afterSeq: number,
): Promise<{ messages: HubMessage[] }> {
  const query = `afterSeq=${afterSeq}&limit=${MESSAGES_PAGE_MAX}`;
  return grouponRequest(
    `/user/groupon_desk/work/chats/${encodeURIComponent(chatId)}/messages?${query}`,
  );
}

/** Every message of a chat, oldest first, paged by `afterSeq` until a short page. */
export async function fetchAllMessages(chatId: string): Promise<HubMessage[]> {
  const all: HubMessage[] = [];
  let afterSeq = 0;
  for (;;) {
    const { messages } = await fetchMessages(chatId, afterSeq);
    all.push(...messages);
    if (messages.length < MESSAGES_PAGE_MAX) return all;
    afterSeq = messages[messages.length - 1].seq;
  }
}

export function machineLabel(machine: Pick<HubMachine, "alias" | "name">): string {
  return machine.alias?.trim() || machine.name;
}
