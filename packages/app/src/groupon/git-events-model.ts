// Added for Groupon Desk (fork of Paseo, Apache-2.0): the commits and pushes in an agent's shell calls, read from the command and its output, for the chat's git timeline.

import type { StreamItem } from "@/types/stream";

export type GitEventStatus = "running" | "done" | "failed";

export interface GitCommitEvent {
  kind: "commit";
  status: GitEventStatus;
  sha: string | null;
  subject: string | null;
  files: number | null;
  additions: number | null;
  deletions: number | null;
  problem: string | null;
}

export interface GitPushEvent {
  kind: "push";
  status: GitEventStatus;
  /** `origin/branch` as the command named it, or as git reported it. */
  target: string | null;
  range: string | null;
  newBranch: boolean;
  upToDate: boolean;
  problem: string | null;
}

export type GitEvent = GitCommitEvent | GitPushEvent;

const SEGMENT_SPLIT = /&&|\|\||;|\n|\|/;
const GIT_VERB =
  /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*git((?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+))*)\s+(commit|push)\b(.*)$/s;
const COMMIT_LINE = /^\[([^\]\s]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m;
const COMMIT_STATS =
  /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;
const PUSH_REF =
  /^\s*[+*!=-]?\s*(\[new branch\]|\[rejected\]|\[remote rejected\]|[0-9a-f]{7,40}\.\.\.?[0-9a-f]{7,40})\s+\S+\s+->\s+(\S+)(?:\s+\((.+)\))?\s*$/m;

/** The git commits and pushes a finished, running or failed shell call made; none for any other call. */
export function gitEventsOf(item: StreamItem): GitEvent[] {
  if (item.kind !== "tool_call" || item.payload.source !== "agent") return [];
  const { detail, status } = item.payload.data;
  if (detail?.type !== "shell") return [];
  const eventStatus = callStatusOf(status, detail.exitCode);
  const output = detail.output ?? "";
  const events: GitEvent[] = [];
  for (const segment of commandSegments(detail.command)) {
    const verb = GIT_VERB.exec(segment);
    if (!verb) continue;
    const rest = verb[3] ?? "";
    if (verb[2] === "commit" && !/--dry-run\b/.test(rest)) {
      events.push(commitEvent(detail.command, output, eventStatus));
    } else if (verb[2] === "push" && !/--dry-run\b/.test(rest)) {
      events.push(pushEvent(rest, output, eventStatus));
    }
  }
  return events;
}

export function isGitEventCall(item: StreamItem): boolean {
  return gitEventsOf(item).length > 0;
}

function callStatusOf(status: string, exitCode: number | null | undefined): GitEventStatus {
  if (status === "running") return "running";
  return status === "failed" || (exitCode ?? 0) !== 0 ? "failed" : "done";
}

function commandSegments(command: string): string[] {
  // A heredoc body is a message, not commands: keep it whole with its `git commit`.
  return command.replace(/<<-?\s*'?(\w+)'?\n[\s\S]*?\n\s*\1\b/g, "").split(SEGMENT_SPLIT);
}

function commitEvent(command: string, output: string, status: GitEventStatus): GitCommitEvent {
  const line = COMMIT_LINE.exec(output);
  const stats = COMMIT_STATS.exec(output);
  return {
    kind: "commit",
    // A commit git reported went through, whatever a later command in the same call did.
    status: line && status === "failed" ? "done" : status,
    sha: line?.[2] ?? null,
    subject: line?.[3]?.trim() ?? messageOf(command),
    files: numberOr(stats?.[1]),
    additions: stats ? (numberOr(stats[2]) ?? 0) : null,
    deletions: stats ? (numberOr(stats[3]) ?? 0) : null,
    problem: status === "failed" && !line ? problemOf(output) : null,
  };
}

function pushEvent(rest: string, output: string, status: GitEventStatus): GitPushEvent {
  const ref = PUSH_REF.exec(output);
  const rejected = ref?.[1] === "[rejected]" || ref?.[1] === "[remote rejected]";
  const upToDate = /Everything up-to-date/.test(output);
  const [remote, branch] = rest
    .trim()
    .split(/\s+/)
    .filter(
      (word) => word !== "" && !word.startsWith("-") && !/^\d?>/.test(word) && word !== "2>&1",
    );
  const reportedBranch = ref?.[2] ?? null;
  const targetBranch = branch?.split(":").at(-1) ?? reportedBranch;
  return {
    kind: "push",
    status: rejected ? "failed" : status,
    target: targetBranch ? `${remote ?? "origin"}/${targetBranch}` : (remote ?? null),
    range: ref && !ref[1]?.startsWith("[") ? (ref[1] ?? null) : null,
    newBranch: ref?.[1] === "[new branch]",
    upToDate,
    problem: pushProblemOf(rejected ? (ref?.[3] ?? "rejected") : null, status, output),
  };
}

function pushProblemOf(
  rejection: string | null,
  status: GitEventStatus,
  output: string,
): string | null {
  if (rejection !== null) return rejection;
  return status === "failed" ? problemOf(output) : null;
}

/** The first line of the commit message the command carries (`-m`, or a heredoc), if it says one. */
function messageOf(command: string): string | null {
  const heredoc = /<<-?\s*'?(\w+)'?\n([\s\S]*?)\n\s*\1\b/.exec(command);
  if (heredoc?.[2]) return firstLine(heredoc[2]);
  const quoted = /(?:^|\s)-m\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/.exec(command);
  const text = quoted?.[1] ?? quoted?.[2];
  return text ? firstLine(text.replace(/\\"/g, '"')) : null;
}

function firstLine(text: string): string | null {
  return (
    text
      .split("\n")
      .find((line) => line.trim() !== "")
      ?.trim() ?? null
  );
}

function numberOr(value: string | undefined): number | null {
  return value === undefined ? null : Number(value);
}

/** The line that says what went wrong: git's own error, else the last line of the output. */
function problemOf(output: string): string | null {
  const lines = output
    .split("\n")
    .map((line) => line.replace(/^remote:\s*/, "").trim())
    .filter((line) => line !== "");
  const said = lines.find((line) =>
    /^(error|fatal|hint: Updates were rejected)\b|nothing to commit/i.test(line),
  );
  return said ?? lines.at(-1) ?? null;
}
