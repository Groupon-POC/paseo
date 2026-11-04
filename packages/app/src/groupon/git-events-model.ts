// Added for Groupon Desk (fork of Paseo, Apache-2.0): the commits and pushes in an agent's shell calls, read from the command and its output, for the chat's git timeline.

import type { StreamItem } from "@/types/stream";

export type GitEventStatus = "running" | "done" | "failed";

export interface GitCommitEvent {
  kind: "commit";
  /** The folder the command ran git in (`git -C`, or a `cd` before it), as written; null for the call's own. */
  dir: string | null;
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
  dir: string | null;
  status: GitEventStatus;
  /** `origin/branch` as the command named it, or as git reported it. */
  target: string | null;
  range: string | null;
  newBranch: boolean;
  upToDate: boolean;
  problem: string | null;
}

export type GitEvent = GitCommitEvent | GitPushEvent;

const GIT_VERB =
  /^\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*git((?:\s+-[Cc]\s+(?:"[^"]*"|'[^']*'|\S+))*)\s+(commit|push)\b([\s\S]*)$/;
const COMMIT_LINE = /^\[([^\]\s]+)(?: \(root-commit\))? ([0-9a-f]{7,40})\] (.+)$/m;
const LOGGED_COMMIT = /^([0-9a-f]{7,40})(?: (.+))?$/m;
const GIT_PREFIX = String.raw`^\s*git(?:\s+-C\s+(?:"[^"]*"|'[^']*'|\S+))*\s+`;
const REV_PARSE_HEAD = new RegExp(
  String.raw`${GIT_PREFIX}rev-parse\s+(?:--short(?:=\d+)?\s+)?HEAD\s*$`,
);
const GIT_LOG = new RegExp(String.raw`${GIT_PREFIX}log\b(.*)$`);
const HEREDOC_OPEN = /<<-?\s*(['"]?)(\w+)\1/;
const BACKGROUND =
  /^Command running in background with ID: [\w-]+\. Output is being written to: (\S+\.output)\b/m;
const COMMIT_STATS =
  /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;
const PUSH_REF =
  /^\s*[+*!=-]?\s*(\[new branch\]|\[rejected\]|\[remote rejected\]|[0-9a-f]{7,40}\.\.\.?[0-9a-f]{7,40})\s+\S+\s+->\s+(\S+)(?:\s+\((.+)\))?\s*$/gm;
/** What git says of a refused push even when a pipe cut its ref line and took its exit code. */
const PUSH_REFUSED =
  /error: failed to push some refs|Updates were rejected|Note about fast-forwards/;

/** One line of a command, with the heredoc body it opens (a message, not commands). */
interface CommandLine {
  text: string;
  heredoc: string | null;
}

interface Segment {
  text: string;
  line: CommandLine;
}

/** The git commits and pushes a finished, running or failed shell call made; none for any other call. */
export function gitEventsOf(item: StreamItem): GitEvent[] {
  if (item.kind !== "tool_call" || item.payload.source !== "agent") return [];
  const { detail, status } = item.payload.data;
  if (detail?.type !== "shell") return [];
  return gitEventsOfShell(
    detail.command,
    detail.output ?? "",
    callStatusOf(status, detail.exitCode),
  );
}

/** The commits and pushes of a shell command, read against what it printed. */
export function gitEventsOfShell(
  command: string,
  output: string,
  status: GitEventStatus,
): GitEvent[] {
  const segments = commandLinesOf(command).flatMap((line) =>
    segmentsOfLine(line.text).map((text) => ({ text, line })),
  );
  const events: GitEvent[] = [];
  const refs = [...output.matchAll(PUSH_REF)];
  const tempVariables = new Set(
    [...command.matchAll(TEMP_VARIABLE)].map((match) => match[1] ?? ""),
  );
  let cd: string | null = null;
  let inScratch = false;
  for (const [index, segment] of segments.entries()) {
    const moved = CD.exec(segment.text);
    if (moved) {
      cd = unquote(moved[1] ?? "");
      inScratch = isScratchFolder(cd, tempVariables) || (inScratch && !isAbsoluteFolder(cd));
    }
    const verb = GIT_VERB.exec(segment.text);
    if (!verb || /--dry-run\b/.test(verb[3] ?? "")) continue;
    const folder = folderOf(verb[1] ?? "");
    // A repository the call made to try something out is not the session's work.
    if (folder ? isScratchFolder(folder, tempVariables) : inScratch) continue;
    const dir = folder ?? cd;
    if (verb[2] === "commit") {
      const later = segments.slice(index + 1).map((next) => next.text);
      events.push({ ...commitEvent(segment, later, output, status), dir });
    } else {
      const ref = refs[events.filter((event) => event.kind === "push").length] ?? null;
      events.push({ ...pushEvent(verb[3] ?? "", ref, output, status), dir });
    }
  }
  return events;
}

export function isGitEventCall(item: StreamItem): boolean {
  return gitEventsOf(item).length > 0;
}

/** The file a call run in the background writes its output to, from what the call printed. */
export function backgroundOutputPathOf(output: string): string | null {
  return BACKGROUND.exec(output)?.[1] ?? null;
}

export function callStatusOf(status: string, exitCode: number | null | undefined): GitEventStatus {
  if (status === "running") return "running";
  return status === "failed" || (exitCode ?? 0) !== 0 ? "failed" : "done";
}

const CD = /^\s*cd\s+("[^"]+"|'[^']+'|\S+)\s*$/;

const unquote = (text: string) => text.replace(/^(["'])(.*)\1$/, "$2");

/** The folder of `git -C <path>` among git's options; null without one. */
function folderOf(options: string): string | null {
  const found = /-C\s+("[^"]+"|'[^']+'|\S+)/.exec(options);
  return found?.[1] ? unquote(found[1]) : null;
}

/** What a scan of shell text outside its quotes and comments found. */
interface ShellScan {
  /** Offsets of `&&`, `||`, `;` and `|` outside quotes and comments, with their length. */
  separators: Array<{ at: number; length: number }>;
  /** Offset of the first line break outside quotes; -1 when there is none. */
  lineEnd: number;
  quoteLeftOpen: boolean;
}

function scanShell(text: string): ShellScan {
  const separators: ShellScan["separators"] = [];
  let quote: string | null = null;
  let lineEnd = -1;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] ?? "";
    if (char === "\\" && quote !== "'") at += 1;
    else if (quote) quote = char === quote ? null : quote;
    else if (char === '"' || char === "'") quote = char;
    else if (char === "\n") {
      lineEnd = at;
      break;
    } else if (char === "#" && (at === 0 || /\s/.test(text[at - 1] ?? ""))) {
      const next = text.indexOf("\n", at);
      if (next === -1) break;
      at = next - 1;
    } else if (char === ";" || char === "|" || (char === "&" && text[at + 1] === "&")) {
      const length = text[at + 1] === char ? 2 : 1;
      separators.push({ at, length });
      at += length - 1;
    }
  }
  return { separators, lineEnd, quoteLeftOpen: quote !== null };
}

/** A line's commands, split outside quotes: `grep "push|git commit"` runs no git. */
function segmentsOfLine(text: string): string[] {
  const segments: string[] = [];
  let start = 0;
  for (const { at, length } of scanShell(text).separators) {
    segments.push(text.slice(start, at));
    start = at + length;
  }
  segments.push(text.slice(start));
  return segments;
}

/** The command's lines; a quote that spans lines stays one line, and a heredoc's body goes with its opener. */
function commandLinesOf(command: string): CommandLine[] {
  const lines = command.split("\n");
  const result: CommandLine[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    let text = lines[index] ?? "";
    const rest = lines.slice(index).join("\n");
    const scan = scanShell(rest);
    if (!scan.quoteLeftOpen) {
      const logical = scan.lineEnd === -1 ? rest : rest.slice(0, scan.lineEnd);
      index += logical.split("\n").length - 1;
      text = logical;
    }
    const tag = HEREDOC_OPEN.exec(text)?.[2];
    const end = tag ? lines.findIndex((line, at) => at > index && line.trim() === tag) : -1;
    result.push({ text, heredoc: end === -1 ? null : lines.slice(index + 1, end).join("\n") });
    if (end !== -1) index = end;
  }
  return result;
}

const TEMP_FOLDER = /^(?:\/private)?\/tmp(?:\/|$)|^\/var\/folders\//;
const TEMP_VARIABLE = /\b([A-Za-z_]\w*)=["']?\$\(\s*mktemp\b/g;
const LEADING_VARIABLE = /^\$\{?([A-Za-z_]\w*)/;

/** A folder the call made for itself: under a temp folder, or in a variable it filled with `mktemp`. */
function isScratchFolder(folder: string, tempVariables: ReadonlySet<string>): boolean {
  if (TEMP_FOLDER.test(folder)) return true;
  const variable = LEADING_VARIABLE.exec(folder)?.[1];
  return variable !== undefined && tempVariables.has(variable);
}

const isAbsoluteFolder = (folder: string) => /^(?:\/|~)/.test(folder);

function commitEvent(
  segment: Segment,
  later: readonly string[],
  output: string,
  status: GitEventStatus,
): Omit<GitCommitEvent, "dir"> {
  const line = COMMIT_LINE.exec(output);
  const named = namedCommit(line, later, output);
  const stats = COMMIT_STATS.exec(output);
  return {
    kind: "commit",
    // A commit git reported went through, whatever a later command in the same call did.
    status: line && status === "failed" ? "done" : status,
    sha: named.sha,
    subject: named.subject ?? messageOf(segment),
    files: numberOr(stats?.[1]),
    additions: stats ? (numberOr(stats[2]) ?? 0) : null,
    deletions: stats ? (numberOr(stats[3]) ?? 0) : null,
    problem: status === "failed" && !line ? problemOf(output) : null,
  };
}

/** The commit git printed; for `git commit -q`, which prints nothing, a `git log -<n>` after it. */
function namedCommit(
  line: RegExpExecArray | null,
  later: readonly string[],
  output: string,
): { sha: string | null; subject: string | null } {
  if (line) return { sha: line[2] ?? null, subject: line[3]?.trim() ?? null };
  const logged = later.some(readsHead) ? LOGGED_COMMIT.exec(output) : null;
  return { sha: logged?.[1] ?? null, subject: logged?.[2]?.trim() ?? null };
}

/** `git log` of HEAD with a count and only options (no other revision), or `git rev-parse HEAD`. */
function readsHead(segment: string): boolean {
  if (REV_PARSE_HEAD.test(segment)) return true;
  const log = GIT_LOG.exec(segment);
  if (!log) return false;
  const args = (log[1] ?? "")
    .replace(/(["'])[^"']*\1/g, "''")
    .split(/\s+/)
    .filter((arg) => arg !== "");
  const counted = args.some((arg) => /^-\d+$|^-n\d*$|^--max-count=\d+$/.test(arg));
  return counted && args.every((arg) => arg.startsWith("-") || /^\d+$|^\d?>/.test(arg));
}

/** A push, read against its own ref line (the n-th push of a call takes the n-th). */
function pushEvent(
  rest: string,
  ref: RegExpExecArray | null,
  output: string,
  status: GitEventStatus,
): Omit<GitPushEvent, "dir"> {
  const refusal = refusalOf(ref, output);
  return {
    kind: "push",
    status: refusal === null ? status : "failed",
    target: pushTargetOf(rest, ref),
    range: ref && !ref[1]?.startsWith("[") ? (ref[1] ?? null) : null,
    newBranch: ref?.[1] === "[new branch]",
    upToDate: !ref && /Everything up-to-date/.test(output),
    problem: pushProblemOf(refusal, status, output),
  };
}

/** Why the remote refused the push; null when it did not. */
function refusalOf(ref: RegExpExecArray | null, output: string): string | null {
  if (ref?.[1] === "[rejected]" || ref?.[1] === "[remote rejected]") return ref[3] ?? "rejected";
  if (ref || !PUSH_REFUSED.test(output)) return null;
  return /fast-forward/.test(output) ? "not a fast-forward" : "rejected";
}

/** `remote/branch` as the command named it, or as git reported it. */
function pushTargetOf(rest: string, ref: RegExpExecArray | null): string | null {
  const [remote, branch] = rest
    .trim()
    .split(/\s+/)
    .filter(
      (word) => word !== "" && !word.startsWith("-") && !/^\d?>/.test(word) && word !== "2>&1",
    );
  const targetBranch = (branch?.split(":").at(-1) ?? ref?.[2])?.replace(/^refs\/heads\//, "");
  return targetBranch ? `${remote ?? "origin"}/${targetBranch}` : (remote ?? null);
}

function pushProblemOf(
  rejection: string | null,
  status: GitEventStatus,
  output: string,
): string | null {
  if (rejection !== null) return rejection;
  return status === "failed" ? problemOf(output) : null;
}

/** The first line of the message the commit itself carries: its heredoc, or `-m`/`--message`. */
function messageOf(segment: Segment): string | null {
  if (segment.line.heredoc !== null && HEREDOC_OPEN.test(segment.text)) {
    return firstLine(segment.line.heredoc);
  }
  const from = segment.line.text.slice(Math.max(0, segment.line.text.indexOf(segment.text)));
  const quoted = /(?:^|\s)(?:-[a-z]*m|--message)(?:=|\s*)(?:"((?:[^"\\]|\\.)*)|'([^']*))/.exec(
    from,
  );
  const text = firstLine((quoted?.[1] ?? quoted?.[2] ?? "").replace(/\\"/g, '"'));
  // `-m "$1"` names a variable, not a message.
  return text && !/^\$\{?\w+\}?$/.test(text) ? text : null;
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
