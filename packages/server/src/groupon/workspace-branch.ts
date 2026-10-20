// Added for Groupon Desk (fork of Paseo, Apache-2.0): a workspace started without a ticket gets its own branch, `<login>/<slug of the first prompt>`.

/**
 * The branch of a workspace started without a ticket: `<github login or unix user>/<slug of the
 * first prompt, at most 40 characters>`, cut from the trunk, never the trunk itself. A ticket's
 * branch is named by `groupon ticket name` (the Groupon plugin's Start a ticket makes it before the
 * worktree is cut, so it never reaches this module). A pull request from such a branch is renamed
 * through `groupon ticket name` before it opens (the company's branch standard; the PR prompt in
 * `.groupon/desk.toml` says so).
 */

import { userInfo } from "node:os";
import { parseGitRemoteLocation } from "@getpaseo/protocol/git-remote";
import { slugify, validateBranchSlug } from "@getpaseo/protocol/branch-slug";
import { findExecutable } from "../executable-resolution/executable-resolution.js";
import { execCommand } from "../utils/spawn.js";
import { runGitCommand } from "../utils/run-git-command.js";

export const PROMPT_SLUG_MAX_LENGTH = 40;
const GH_LOGIN_TIMEOUT_MS = 5_000;

/**
 * The first prompt as a branch slug: diacritics dropped (`přihlášení` → `prihlaseni`), lower case,
 * every other run of characters one hyphen, at most `max` characters, cut at a word when the cut
 * keeps more than half. Empty when the prompt has no letter or digit.
 */
export function promptSlug(prompt: string, max = PROMPT_SLUG_MAX_LENGTH): string {
  const plain = prompt.normalize("NFKD").replace(/[̀-ͯ]/g, "");
  const slug = slugify(plain);
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf("-");
  return (lastHyphen > max / 2 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, "");
}

/** `<owner>/<slug>`, both parts as git branch slugs; null when either is empty or invalid. */
export function workspaceBranchName(owner: string, slug: string): string | null {
  const ownerSlug = slugify(owner);
  const nameSlug = slugify(slug);
  if (!ownerSlug || !nameSlug) return null;
  const name = `${ownerSlug}/${nameSlug}`;
  return validateBranchSlug(name).valid ? name : null;
}

export interface BranchOwnerDeps {
  /** The GitHub login gh is signed in with on `host` (null: github.com), or null. */
  readGithubLogin: (host: string | null) => Promise<string | null>;
  unixUser: () => string;
}

const loginByHost = new Map<string, Promise<string | null>>();

async function readGithubLoginWithGh(host: string | null): Promise<string | null> {
  const key = host ?? "github.com";
  const cached = loginByHost.get(key);
  if (cached) return cached;
  const lookup = (async () => {
    const gh = await findExecutable("gh");
    if (!gh) return null;
    const args = ["api", "user", "--jq", ".login"];
    if (host && host !== "github.com") args.push("--hostname", host);
    try {
      const { stdout } = await execCommand(gh, args, {
        envOverlay: { GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" },
        timeout: GH_LOGIN_TIMEOUT_MS,
      });
      const login = String(stdout).trim();
      return login.length > 0 ? login : null;
    } catch {
      return null;
    }
  })();
  loginByHost.set(key, lookup);
  const login = await lookup;
  // A failed read (gh signed out, offline) is asked again next time; a login is kept.
  if (!login) loginByHost.delete(key);
  return login;
}

const defaultOwnerDeps: BranchOwnerDeps = {
  readGithubLogin: readGithubLoginWithGh,
  unixUser: () => userInfo().username,
};

/** The branch's first segment: the GitHub login on the repository's host, else the unix user. */
export async function resolveBranchOwner(
  remoteUrl: string | null | undefined,
  deps: BranchOwnerDeps = defaultOwnerDeps,
): Promise<string> {
  const host = remoteUrl ? (parseGitRemoteLocation(remoteUrl)?.host ?? null) : null;
  const login = await deps.readGithubLogin(host).catch(() => null);
  return login ?? deps.unixUser();
}

async function gitRefExists(cwd: string, ref: string): Promise<boolean> {
  const result = await runGitCommand(["show-ref", "--verify", "--quiet", ref], {
    cwd,
    acceptExitCodes: [0, 1],
  });
  return result.exitCode === 0;
}

/** True when the branch exists here or on origin, so a new workspace never takes over one. */
export async function branchTaken(cwd: string, branch: string): Promise<boolean> {
  return (
    (await gitRefExists(cwd, `refs/heads/${branch}`)) ||
    (await gitRefExists(cwd, `refs/remotes/origin/${branch}`))
  );
}

export interface WorkspaceBranchInput {
  /** The repository the branch is made in. */
  repoRoot: string;
  remoteUrl: string | null;
  /** The person's first prompt, when the workspace starts with one. */
  prompt: string | null | undefined;
  /** The slug when the prompt gives none (a workspace started empty): the worktree's own name. */
  fallbackSlug: string;
}

export interface WorkspaceBranchDeps extends BranchOwnerDeps {
  branchTaken: (cwd: string, branch: string) => Promise<boolean>;
}

const defaultBranchDeps: WorkspaceBranchDeps = { ...defaultOwnerDeps, branchTaken };

const MAX_SUFFIX = 50;

/**
 * The new branch for a workspace started without a ticket, free in the repository:
 * `<owner>/<slug>`, else `<owner>/<slug>-2`, `-3`, ... Null when no valid name can be made.
 */
export async function nameWorkspaceBranch(
  input: WorkspaceBranchInput,
  deps: WorkspaceBranchDeps = defaultBranchDeps,
): Promise<{ branchName: string; fromPrompt: boolean } | null> {
  const owner = await resolveBranchOwner(input.remoteUrl, deps);
  const fromPromptSlug = input.prompt ? promptSlug(input.prompt) : "";
  const slug = fromPromptSlug || input.fallbackSlug;
  const base = workspaceBranchName(owner, slug);
  if (!base) return null;
  for (let attempt = 1; attempt <= MAX_SUFFIX; attempt++) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    if (!(await deps.branchTaken(input.repoRoot, candidate))) {
      return { branchName: candidate, fromPrompt: fromPromptSlug.length > 0 };
    }
  }
  return null;
}

/**
 * The name a workspace's placeholder branch takes after its first message, when the workspace
 * started empty: a placeholder this module named (`<owner>/<worktree name>`) becomes
 * `<owner>/<slug of that first message>`; null keeps the placeholder (the message gave no slug).
 * A placeholder without an owner segment is Paseo's own (an agent's worktree): undefined, so
 * Paseo's generated name applies as before.
 */
export function renameTargetForPlaceholder(
  placeholder: string | null | undefined,
  prompt: string | null | undefined,
): string | null | undefined {
  const slash = placeholder?.indexOf("/") ?? -1;
  if (!placeholder || slash <= 0) return undefined;
  const slug = prompt ? promptSlug(prompt) : "";
  return slug ? workspaceBranchName(placeholder.slice(0, slash), slug) : null;
}
