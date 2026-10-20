// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace a person starts without a ticket gets its own branch, never the trunk.

/**
 * Where a workspace the person starts from New workspace without a ticket is placed, decided
 * before Paseo creates it (only for a window that advertises the `groupon_workspace_placement`
 * capability, so Paseo's own clients and tests keep Paseo's behaviour):
 * - "Local" on a checkout that sits on a shared trunk (`staging`, the default branch, desk.toml's
 *   `target_branch`) becomes a worktree cut from that trunk, so the person's work never lands on
 *   the trunk and the release train's pull request is never taken for the workspace's own.
 * - A worktree that branches off without a name gets `<github login or unix user>/<slug of the
 *   first prompt, 40 characters>` (`workspace-branch.ts`), kept as named (Paseo's rename after the
 *   first message is skipped). A workspace started empty gets `<owner>/<worktree name>`, renamed
 *   to `<owner>/<slug of its first message>` when that message comes.
 *
 * Constraints:
 * - Never touches a checkout of an existing branch, a pull request's checkout, a request that
 *   names its branch (Start a ticket's, through the Groupon plugin), an agent's request
 *   (`callerAgentId`) or a background workspace.
 * - When a fact cannot be read the request is left as Paseo would run it; nothing is made up.
 */

import { createNameId } from "mnemonic-id";
import type { SessionInboundMessage } from "@getpaseo/protocol/messages";
import type { CheckoutSnapshotFacts } from "../utils/checkout-git.js";
import { expandTilde } from "../utils/path.js";
import { isSharedTrunkBranch, repositoryTrunksOf } from "./shared-trunk.js";
import type { WorkspaceBranchInput } from "./workspace-branch.js";

export type WorkspaceCreateRequest = Extract<
  SessionInboundMessage,
  { type: "workspace.create.request" }
>;
type WorktreeSource = Extract<WorkspaceCreateRequest["source"], { kind: "worktree" }>;

export interface WorkspacePlacementDeps {
  readFacts: (cwd: string) => Promise<CheckoutSnapshotFacts>;
  resolveWorktreeSourceCwd: (source: WorktreeSource) => Promise<string>;
  nameBranch: (
    input: WorkspaceBranchInput,
  ) => Promise<{ branchName: string; fromPrompt: boolean } | null>;
  createSlug?: () => string;
}

export interface WorkspacePlacement {
  request: WorkspaceCreateRequest;
  /** True when the branch is named from the first prompt and Paseo must not rename it. */
  keepBranchName: boolean;
}

async function readFactsOrNull(
  deps: WorkspacePlacementDeps,
  cwd: string,
): Promise<Extract<CheckoutSnapshotFacts, { isGit: true }> | null> {
  try {
    const facts = await deps.readFacts(cwd);
    return facts.isGit ? facts : null;
  } catch {
    return null;
  }
}

function branchesOffWithoutName(source: WorktreeSource): boolean {
  return (
    source.action !== "checkout" &&
    source.checkoutSource === undefined &&
    source.githubPrNumber === undefined &&
    !source.branchName?.trim()
  );
}

/** Local on a checkout that sits on a shared trunk, as a worktree cut from that trunk; else null. */
async function worktreeOffTrunk(
  source: Extract<WorkspaceCreateRequest["source"], { kind: "directory" }>,
  deps: WorkspacePlacementDeps,
): Promise<WorktreeSource | null> {
  const path = expandTilde(source.path);
  const facts = await readFactsOrNull(deps, path);
  if (!facts?.currentBranch) return null;
  if (!isSharedTrunkBranch(facts.currentBranch, repositoryTrunksOf(facts))) return null;
  return {
    kind: "worktree",
    cwd: path,
    ...(source.projectId ? { projectId: source.projectId } : {}),
    refName: facts.currentBranch,
  };
}

/** The `<owner>/<slug>` branch for a worktree that branches off without a name; null when none can be made. */
async function nameForWorktree(
  request: WorkspaceCreateRequest,
  source: WorktreeSource,
  deps: WorkspacePlacementDeps,
): Promise<{ worktreeSlug: string; branchName: string; fromPrompt: boolean } | null> {
  let sourceCwd: string;
  try {
    sourceCwd = await deps.resolveWorktreeSourceCwd(source);
  } catch {
    return null;
  }
  const facts = await readFactsOrNull(deps, sourceCwd);
  if (!facts) return null;
  const worktreeSlug = source.worktreeSlug?.trim() || (deps.createSlug ?? createNameId)();
  const named = await deps
    .nameBranch({
      repoRoot: facts.mainRepoRoot ?? facts.worktreeRoot,
      remoteUrl: facts.remoteUrl,
      prompt: request.firstAgentContext?.prompt ?? null,
      fallbackSlug: worktreeSlug,
    })
    .catch(() => null);
  return named ? { worktreeSlug, ...named } : null;
}

export async function placeTicketlessWorkspace(
  request: WorkspaceCreateRequest,
  deps: WorkspacePlacementDeps,
): Promise<WorkspacePlacement> {
  if (request.callerAgentId || request.background) return { request, keepBranchName: false };

  const source =
    request.source.kind === "directory"
      ? await worktreeOffTrunk(request.source, deps)
      : request.source;
  if (!source) return { request, keepBranchName: false };
  const placed = source === request.source ? request : { ...request, source };
  if (!branchesOffWithoutName(source)) return { request: placed, keepBranchName: false };

  const named = await nameForWorktree(request, source, deps);
  if (!named) return { request: placed, keepBranchName: false };
  return {
    request: {
      ...request,
      source: { ...source, worktreeSlug: named.worktreeSlug, branchName: named.branchName },
    },
    keepBranchName: named.fromPrompt,
  };
}
