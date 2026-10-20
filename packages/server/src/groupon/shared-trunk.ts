// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace on a shared trunk is never matched to a pull request.

/**
 * The shared trunks of a repository: the branches every person and every release train works
 * against (`staging`, `production`, `main`, `master`, `develop`, the repository's default branch
 * and `.groupon/desk.toml`'s `[git] target_branch`). A pull request is matched to a workspace only
 * when its head is the workspace's own branch and that branch is none of these: a workspace that
 * sits on a trunk shows no pull request and no checks, and auto-archive-on-merge never fires for
 * it. Without this, a workspace on `staging` took the release train's pull request (head
 * `staging`, base `production`) as its own, showed its cancelled checks as "failed", and was
 * archived when the train merged (measured on the owner's Mac, 2026-10-20).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

/** The trunk names every repository is assumed to share, whatever its own settings say. */
export const FIXED_SHARED_TRUNKS: readonly string[] = [
  "staging",
  "production",
  "main",
  "master",
  "develop",
];

const DESK_TOML = join(".groupon", "desk.toml");

/** `refs/heads/x`, `refs/remotes/origin/x`, `origin/x` → `x`; blank → null. */
export function branchNameOf(ref: string | null | undefined): string | null {
  const trimmed = ref?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("refs/heads/")) return trimmed.slice("refs/heads/".length) || null;
  if (trimmed.startsWith("refs/remotes/")) {
    const remoteShort = trimmed.slice("refs/remotes/".length);
    const slash = remoteShort.indexOf("/");
    return slash >= 0 ? remoteShort.slice(slash + 1) || null : remoteShort || null;
  }
  if (trimmed.startsWith("origin/")) return trimmed.slice("origin/".length) || null;
  return trimmed;
}

/** True when `branch` is one of the fixed trunks or one of the repository's own (`extraTrunks`). */
export function isSharedTrunkBranch(
  branch: string | null | undefined,
  extraTrunks: readonly (string | null | undefined)[] = [],
): boolean {
  const name = branchNameOf(branch);
  if (!name) return false;
  if (FIXED_SHARED_TRUNKS.includes(name)) return true;
  return extraTrunks.some((trunk) => branchNameOf(trunk) === name);
}

const targetBranchCache = new Map<string, { mtimeMs: number; value: string | null }>();

/** `[git] target_branch` of the repository's `.groupon/desk.toml`, or null (no file, no key, not TOML). */
export function readDeskTargetBranch(repoRoot: string | null | undefined): string | null {
  if (!repoRoot) return null;
  const path = join(repoRoot, DESK_TOML);
  try {
    if (!existsSync(path)) return null;
    const { mtimeMs } = statSync(path);
    const cached = targetBranchCache.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.value;
    const doc = parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
    const git = doc.git;
    const raw =
      typeof git === "object" && git !== null && !Array.isArray(git)
        ? (git as Record<string, unknown>).target_branch
        : undefined;
    const value = typeof raw === "string" ? branchNameOf(raw) : null;
    targetBranchCache.set(path, { mtimeMs, value });
    return value;
  } catch {
    return null;
  }
}

/**
 * The repository's default branch as `origin/HEAD` names it, read from the git common dir
 * without running git (a symbolic ref is always a loose file). Null when origin/HEAD is not set.
 */
export function readOriginHeadBranch(
  gitCommonDir: string | null | undefined,
  worktreeRoot?: string | null,
): string | null {
  if (!gitCommonDir) return null;
  const commonDir =
    isAbsolute(gitCommonDir) || !worktreeRoot ? gitCommonDir : resolve(worktreeRoot, gitCommonDir);
  try {
    const text = readFileSync(join(commonDir, "refs", "remotes", "origin", "HEAD"), "utf8").trim();
    return text.startsWith("ref: ") ? branchNameOf(text.slice("ref: ".length)) : null;
  } catch {
    return null;
  }
}

/** The facts of a checkout this module reads; a subset of the server's `CheckoutSnapshotFacts`. */
export interface SharedTrunkCheckoutFacts {
  worktreeRoot: string;
  currentBranch: string | null;
  gitCommonDir: string | null;
  mainRepoRoot: string | null;
  storedBaseRef: string | null;
  resolvedBaseRef: string | null;
  pullRequestLookupTarget: { headRef: string; headRepositoryOwner?: string } | null;
}

/** Every trunk of this checkout's repository beyond the fixed ones. */
export function repositoryTrunksOf(facts: SharedTrunkCheckoutFacts): string[] {
  return [
    facts.resolvedBaseRef,
    facts.storedBaseRef,
    readOriginHeadBranch(facts.gitCommonDir, facts.worktreeRoot),
    readDeskTargetBranch(facts.worktreeRoot) ?? readDeskTargetBranch(facts.mainRepoRoot),
  ].filter((trunk): trunk is string => Boolean(trunk));
}

const verdicts = new WeakMap<object, boolean>();

/**
 * True when no pull request may be matched to this checkout: it sits on a shared trunk, or the
 * pull request it would be matched to has a shared trunk of this repository as its head. A head
 * in another owner's fork (`headRepositoryOwner`) is that fork's own branch, never our trunk.
 * Remembered per facts object, so a refresh (new facts) reads the repository again.
 */
export function isCheckoutOnSharedTrunk(facts: SharedTrunkCheckoutFacts): boolean {
  const remembered = verdicts.get(facts);
  if (remembered !== undefined) return remembered;
  const trunks = repositoryTrunksOf(facts);
  const lookup = facts.pullRequestLookupTarget;
  const verdict =
    isSharedTrunkBranch(facts.currentBranch, trunks) ||
    (lookup !== null && !lookup.headRepositoryOwner && isSharedTrunkBranch(lookup.headRef, trunks));
  verdicts.set(facts, verdict);
  return verdict;
}

/** What the workspace git service knows of a workspace when it asks whether it sits on a trunk. */
export interface SharedTrunkQuery {
  /** The checkout's facts when they belong to the current branch; null when not loaded yet. */
  facts: SharedTrunkCheckoutFacts | null;
  currentBranch: string | null;
  baseRef: string | null;
  repoRoot: string | null;
}

/** The rule the daemon runs with (`bootstrap.ts` hands it to the workspace git service). */
export function isWorkspaceOnSharedTrunk(query: SharedTrunkQuery): boolean {
  if (query.facts) return isCheckoutOnSharedTrunk(query.facts);
  return isSharedTrunkBranch(query.currentBranch, [
    query.baseRef,
    readDeskTargetBranch(query.repoRoot),
  ]);
}
