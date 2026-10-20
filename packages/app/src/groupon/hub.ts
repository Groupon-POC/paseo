// Added for Groupon Desk (fork of Paseo, Apache-2.0): the hub's reads, typed as Core answers them.

/**
 * The hub is Groupon Desk's server side on Core (`user/groupon_desk`, monorepo
 * `.context/work-window/hub-spec.md`): the person's Macs, the registry of repositories,
 * workspaces and chats (and every Mac's checkouts of each repository, as its hand reports them),
 * and the sealed transcript store; and the workspaces shared between
 * colleagues (design section 13: the grants, a grant, a revoke, a colleague's prompt and permission
 * answer). Dates arrive as ISO strings.
 */

import { grouponRequest, grouponSend } from "./session";

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

/** A checkout of a repository on one of the person's Macs, as that Mac's hand reported it. */
export interface HubCheckout {
  id: string;
  /** The hub's id of the Mac (`HubMachine.machine`). */
  machine: string;
  repositoryId: string;
  /** The checkout's folder on that Mac. */
  rootPath: string;
}

export interface HubWorkspace {
  id: string;
  machine: string;
  repositoryId: string;
  branch: string | null;
  targetBranch: string;
  ticketKey: string | null;
  name: string;
  /** The worktree's folder on its Mac; what ties a Paseo workspace in the sidebar to its hub row. */
  path?: string | null;
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
  /** A colleague's prompt in a shared workspace names its writer; null for the owner's own. */
  senderUserId?: string | null;
  /** The share key version a colleague's `envelope` is sealed under. */
  shareKeyVersion?: number | null;
  createdAt: string;
}

export type HubShareRole = "read" | "write";

/** A person as a share names them. */
export interface HubSharePerson {
  userId: string;
  name: string;
  email: string;
  publicKey: string | null;
}

/** One of the person's active grants, as its owner sees it. */
export interface HubShare {
  id: string;
  workspaceId: string;
  grantee: HubSharePerson;
  role: HubShareRole;
  sealedShareKey: string | null;
  shareKeyVersion: number | null;
  createdAt: string;
}

/** A workspace a colleague shared with the person: the grant, the box, the owner, the workspace, its chats. */
export interface HubSharedWorkspace {
  shareId: string;
  role: HubShareRole;
  sealedShareKey: string | null;
  shareKeyVersion: number | null;
  owner: HubSharePerson;
  repositoryName: string;
  workspace: Pick<
    HubWorkspace,
    | "id"
    | "machine"
    | "branch"
    | "targetBranch"
    | "ticketKey"
    | "name"
    | "state"
    | "status"
    | "updatedAt"
  >;
  chats: Pick<
    HubChat,
    | "id"
    | "workspaceId"
    | "machine"
    | "agent"
    | "title"
    | "model"
    | "effort"
    | "status"
    | "lastMessageAt"
    | "createdAt"
  >[];
  sharedAt: string;
}

export interface HubOverview {
  repositories: HubRepository[];
  /** Every Mac's checkouts of those repositories (absent from an older hub). */
  checkouts?: HubCheckout[];
  workspaces: HubWorkspace[];
  chats: HubChat[];
  machines: HubMachine[];
  /** The person's active grants (absent from an older hub). */
  shares?: HubShare[];
  /** What colleagues shared with the person (absent from an older hub). */
  sharedWithMe?: HubSharedWorkspace[];
  /** Who has one of those workspaces open now (absent from an older hub). */
  presence?: HubPresenceSummary[];
}

/** One person with a workspace open now, as the hub's check-in answers it. */
export interface HubPresencePerson {
  userId: string;
  name: string;
  email: string;
  role: "owner" | HubShareRole;
  /** The caller. */
  you: boolean;
  /** The devices they have it open on, as each window named itself. */
  devices: string[];
  seenAt: string;
}

/** The Mac a workspace runs on, as Core's relay sees it now. */
export interface HubPresenceHand {
  machine: string;
  label: string;
  connected: boolean;
  relayClients: number;
}

/** Who is in one workspace now: the owner first, each person once. */
export interface HubWorkspacePresence {
  workspaceId: string;
  people: HubPresencePerson[];
  hand: HubPresenceHand | null;
  sharedWith: number;
}

/** The overview's line for a workspace somebody has open now. */
export interface HubPresenceSummary {
  workspaceId: string;
  people: { userId: string; name: string; you: boolean }[];
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

/** The window's client id on what it issues. */
const ISSUED_BY = "groupon-desk-window";

/** Share one of the person's workspaces with a colleague by email; a second call changes the role. */
export function shareWorkspace(
  workspaceId: string,
  granteeEmail: string,
  role: HubShareRole,
): Promise<{ share: HubShare }> {
  return grouponSend(
    `/user/groupon_desk/work/workspaces/${encodeURIComponent(workspaceId)}/shares`,
    "POST",
    { granteeEmail, role, issuedBy: ISSUED_BY },
  );
}

/**
 * Say this window has the workspace open (one of the person's, or one shared with them) and hear
 * who else is in it; the window repeats it every 15 s while the workspace is on screen.
 */
export function checkInPresence(
  workspaceId: string,
  device: string,
): Promise<{ presence: HubWorkspacePresence }> {
  return grouponSend(
    `/user/groupon_desk/work/workspaces/${encodeURIComponent(workspaceId)}/presence`,
    "POST",
    { device },
  );
}

/** Revoke one of the person's grants: the colleague is refused at once. */
export function revokeShare(shareId: string): Promise<{ share: HubShare }> {
  return grouponSend(
    `/user/groupon_desk/work/shares/${encodeURIComponent(shareId)}/revoke`,
    "POST",
    {
      issuedBy: ISSUED_BY,
    },
  );
}

/** A colleague's prompt, sealed under the workspace's share key at `shareKeyVersion`: a command the owner's Mac runs. */
export function sendSharedPrompt(
  chatId: string,
  envelope: string,
  shareKeyVersion: number,
): Promise<{ command: { id: string } }> {
  return grouponSend(
    `/user/groupon_desk/work/chats/${encodeURIComponent(chatId)}/messages`,
    "POST",
    {
      envelope,
      shareKeyVersion,
      issuedBy: ISSUED_BY,
    },
  );
}

/** Allow or deny what the agent asked, in a chat shared with the person to write (or the person's own). */
export function answerPermission(
  chatId: string,
  requestId: string,
  behavior: "allow" | "deny",
  message?: string,
): Promise<{ command: { id: string } }> {
  return grouponSend(
    `/user/groupon_desk/work/chats/${encodeURIComponent(chatId)}/permission`,
    "POST",
    {
      requestId,
      behavior,
      ...(message ? { message } : {}),
      issuedBy: ISSUED_BY,
    },
  );
}
