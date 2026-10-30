// Added for Groupon Desk (fork of Paseo, Apache-2.0): a commit's or a push's details as the daemon reads them from git, for the chat's git timeline.

import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

const GROUPON_DESK_RPC_PLUGIN_ID = "groupon-desk";
const GIT_DETAILS_RPC = "groupon-desk.git.details";

export interface GitFileChange {
  path: string;
  additions: number | null;
  deletions: number | null;
}

export interface GitCommitDetails {
  sha: string;
  subject: string;
  body: string;
  author: string;
  files: GitFileChange[];
  moreFiles: number;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");
const count = (value: unknown) => (typeof value === "number" ? value : null);

function fileOf(value: unknown): GitFileChange | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.path !== "string") return null;
  return { path: row.path, additions: count(row.additions), deletions: count(row.deletions) };
}

/** The daemon's answer, checked; none from a daemon that predates the read. */
export function gitDetailsOf(answer: unknown): GitCommitDetails[] {
  const commits =
    typeof answer === "object" && answer !== null && "commits" in answer
      ? (answer as { commits: unknown }).commits
      : [];
  if (!Array.isArray(commits)) return [];
  return commits.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const row = value as Record<string, unknown>;
    if (typeof row.sha !== "string") return [];
    const files = Array.isArray(row.files) ? row.files.map(fileOf) : [];
    return [
      {
        sha: row.sha,
        subject: text(row.subject),
        body: text(row.body),
        author: text(row.author),
        files: files.filter((file): file is GitFileChange => file !== null),
        moreFiles: count(row.moreFiles) ?? 0,
      },
    ];
  });
}

export async function readGitDetails(
  client: Pick<DaemonClient, "invokePluginRpc">,
  cwd: string,
  revision: string,
): Promise<GitCommitDetails[]> {
  return gitDetailsOf(
    await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, GIT_DETAILS_RPC, { cwd, revision }),
  );
}

/** The folder git ran in: the call's own, or the one the command named (`git -C`, `cd`) against it. */
export function repositoryFolderOf(callCwd: string, dir: string | null): string {
  if (!dir) return callCwd;
  if (dir.startsWith("/") || dir.startsWith("~/")) return dir;
  return `${callCwd.replace(/\/+$/, "")}/${dir}`;
}

/** The lines of a failed call's output that say what went wrong, at most `limit`. */
export function problemLinesOf(output: string, limit = 8): string[] {
  return output
    .split("\n")
    .map((line) => line.replace(/^remote:\s*/, "").trimEnd())
    .filter((line) => /\b(error|fatal|rejected|hint)\b|✗/i.test(line))
    .slice(0, limit);
}

const BACKGROUND_OUTPUT_RPC = "groupon-desk.shell.output";

/** What a call run in the background printed so far, and its exit code once it finished. */
export async function readBackgroundOutput(
  client: Pick<DaemonClient, "invokePluginRpc">,
  path: string,
): Promise<{ output: string; exitCode: number | null }> {
  const answer = await client.invokePluginRpc(GROUPON_DESK_RPC_PLUGIN_ID, BACKGROUND_OUTPUT_RPC, {
    path,
  });
  const fields =
    typeof answer === "object" && answer !== null ? (answer as Record<string, unknown>) : {};
  return { output: text(fields.output), exitCode: count(fields.exitCode) };
}
