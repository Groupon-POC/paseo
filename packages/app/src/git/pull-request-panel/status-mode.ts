// Added for Groupon Desk (fork of Paseo, Apache-2.0): the status display mode of the PR activity.
// Folds the timeline into reviewer verdicts, machine reports and leftover conversation, the way
// the checks widget folds runs into rows. Parsing is structural (review states from the API,
// status emoji, a verdict line) and every knob lives in `status-rules.ts`; an activity the parser
// cannot place falls back into the conversation untouched, so a reworded bot degrades, not breaks.

import type { PrPaneActivity, ReviewState } from "./data";
import type { PrThreadEntry, PrTimelineEntry } from "./timeline";
import type { PrReportStatus, PrStatusRules } from "./status-rules";

export interface PrSeverityCount {
  token: string;
  tone: "danger" | "warning" | "info" | "muted";
  count: number;
}

export interface PrReviewRound {
  activity: PrPaneActivity;
  threads: PrThreadEntry[];
  /** The cleaned verdict line, or the first meaningful line when no verdict is found. */
  verdictText: string | null;
  state: ReviewState;
  severities: PrSeverityCount[];
  gated: boolean;
  /** The commit the round reviewed, when its first line names one. */
  sha: string | null;
}

export interface PrReviewerGroup {
  kind: "reviewer";
  id: string;
  author: string;
  avatarColor: string;
  avatarUrl?: string | null;
  rounds: PrReviewRound[];
  latest: PrReviewRound;
}

export interface PrReportEntry {
  kind: "report";
  id: string;
  title: string;
  status: PrReportStatus;
  activity: PrPaneActivity;
  /** Earlier runs of the same report that this one replaced. */
  supersededCount: number;
  sha: string | null;
}

export interface PrCommandEntry {
  kind: "command";
  id: string;
  command: string;
  count: number;
  latest: PrPaneActivity;
}

export interface PrStatusModel {
  reviewers: PrReviewerGroup[];
  /** failure / warning / pending reports, in timeline order. */
  attentionReports: PrReportEntry[];
  passedReports: PrReportEntry[];
  infoReports: PrReportEntry[];
  commands: PrCommandEntry[];
  /** Whatever the parser does not understand, as the plain timeline renders it. */
  conversation: PrTimelineEntry[];
}

export function buildPrStatusModel(
  entries: readonly PrTimelineEntry[],
  rules: PrStatusRules,
): PrStatusModel {
  const compiled = compileRules(rules);
  const model: PrStatusModel = {
    reviewers: [],
    attentionReports: [],
    passedReports: [],
    infoReports: [],
    commands: [],
    conversation: [],
  };
  const reviewersByAuthor = new Map<string, PrReviewerGroup>();
  const reportsByKey = new Map<string, PrReportEntry>();
  const commandsByText = new Map<string, PrCommandEntry>();
  const comments: { entry: PrTimelineEntry; activity: PrPaneActivity }[] = [];

  // Reviews first: an author is a reviewer because the forge says so, never because of wording.
  for (const entry of entries) {
    try {
      if (entry.kind === "review") {
        addRound(reviewersByAuthor, entry.review, entry.threads, compiled);
        continue;
      }
      if (entry.kind === "single" && entry.activity.kind === "review") {
        addRound(reviewersByAuthor, entry.activity, [], compiled);
        continue;
      }
      if (entry.kind === "single") {
        comments.push({ entry, activity: entry.activity });
        continue;
      }
      model.conversation.push(entry);
    } catch {
      model.conversation.push(entry);
    }
  }

  for (const { entry, activity } of comments) {
    try {
      const body = activity.body;
      if (compiled.command.test(body.trim())) {
        const command = body.trim();
        const existing = commandsByText.get(command);
        if (existing) {
          existing.count += 1;
          existing.latest = activity;
        } else {
          commandsByText.set(command, {
            kind: "command",
            id: `command:${activity.id}`,
            command,
            count: 1,
            latest: activity,
          });
        }
        continue;
      }
      if (compiled.notices.some((notice) => notice.test(body))) {
        model.conversation.push(entry);
        continue;
      }
      const report = parseReport(activity, compiled);
      if (report) {
        const previous = reportsByKey.get(report.key);
        reportsByKey.set(report.key, {
          ...report.entry,
          supersededCount: previous ? previous.supersededCount + 1 : 0,
        });
        continue;
      }
      // A comment that carries a verdict is a review round posted as a comment, but only from an
      // author the forge already marked as a reviewer: anyone can quote the word "verdict".
      const reviewer = reviewersByAuthor.get(activity.author);
      if (reviewer && hasVerdictLine(body, compiled)) {
        addRound(reviewersByAuthor, activity, [], compiled);
        continue;
      }
      model.conversation.push(entry);
    } catch {
      model.conversation.push(entry);
    }
  }

  for (const reviewer of reviewersByAuthor.values()) {
    reviewer.latest = reviewer.rounds[reviewer.rounds.length - 1];
    model.reviewers.push(reviewer);
  }
  for (const report of reportsByKey.values()) {
    if (report.status === "success") {
      model.passedReports.push(report);
    } else if (report.status === "info") {
      model.infoReports.push(report);
    } else {
      model.attentionReports.push(report);
    }
  }
  model.commands = [...commandsByText.values()];
  return model;
}

interface CompiledRules {
  rules: PrStatusRules;
  /** Longest first, so "✔️" wins over "✔" and "in progress" over "in". */
  statusTokens: { token: string; status: PrReportStatus; word: RegExp | null }[];
  verdictLine: RegExp;
  blockerCount: RegExp;
  gate: RegExp;
  command: RegExp;
  notices: RegExp[];
  reportKeyStrips: RegExp[];
}

function compileRules(rules: PrStatusRules): CompiledRules {
  return {
    rules,
    statusTokens: Object.entries(rules.statusTokens)
      .map(([token, status]) => ({
        token,
        status,
        word: /^[\w\s-]+$/.test(token) ? safeRegExp(`\\b${escapeRegExp(token)}\\b`, "i") : null,
      }))
      .sort((a, b) => b.token.length - a.token.length),
    verdictLine: safeRegExp(rules.verdictLinePattern, "i") ?? /\bverdict\b/i,
    blockerCount: safeRegExp(rules.blockerCountPattern, "i") ?? /(\d+)\s+blockers?\b/i,
    gate: safeRegExp(rules.gatePattern) ?? /⛔/,
    command: safeRegExp(rules.commandPattern, "i") ?? /^\/[a-z][\w-]*\s*$/i,
    notices: rules.noticePatterns.flatMap((pattern) => safeRegExp(pattern, "i") ?? []),
    reportKeyStrips: rules.reportKeyStripPatterns.flatMap(
      (pattern) => safeRegExp(pattern, "gi") ?? [],
    ),
  };
}

/** A broken regex in an override must not take the whole mode down. */
function safeRegExp(pattern: string, flags?: string): RegExp | null {
  try {
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function meaningfulLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("<!--"));
}

function hasVerdictLine(body: string, compiled: CompiledRules): boolean {
  return meaningfulLines(body).some((line) => compiled.verdictLine.test(line));
}

function firstSha(line: string): string | null {
  const match = line.match(/\b[0-9a-f]{7,40}\b/);
  return match ? match[0].slice(0, 7) : null;
}

function cleanLine(line: string): string {
  return line
    .replace(/^#+\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function addRound(
  reviewers: Map<string, PrReviewerGroup>,
  activity: PrPaneActivity,
  threads: PrThreadEntry[],
  compiled: CompiledRules,
) {
  const round = parseRound(activity, threads, compiled);
  const existing = reviewers.get(activity.author);
  if (!existing) {
    reviewers.set(activity.author, {
      kind: "reviewer",
      id: `reviewer:${activity.author}`,
      author: activity.author,
      avatarColor: activity.avatarColor,
      avatarUrl: activity.avatarUrl,
      rounds: [round],
      latest: round,
    });
    return;
  }
  // Some bots submit a stub review for the inline comments and the full verdict as a separate
  // comment. Both name the same commit, so same author + same sha is one round: the longer body
  // carries the verdict, the review side carries the API state and the threads.
  const sibling = round.sha
    ? existing.rounds.find((candidate) => candidate.sha === round.sha)
    : findStubSibling(existing.rounds, round);
  if (sibling) {
    mergeRounds(sibling, round);
    return;
  }
  existing.rounds.push(round);
}

/**
 * The sha-less form of the stub pattern: a review whose whole body is its heading, and a comment
 * whose heading normalizes to the same words. Restricted to that shape so two real rounds that
 * merely share a title never collapse into one.
 */
function findStubSibling(rounds: PrReviewRound[], round: PrReviewRound): PrReviewRound | undefined {
  if (round.sha !== null || round.activity.kind !== "comment") {
    return undefined;
  }
  const heading = normalizedHeading(round.activity.body);
  if (heading === null) {
    return undefined;
  }
  return rounds.find(
    (candidate) =>
      candidate.sha === null &&
      candidate.activity.kind === "review" &&
      meaningfulLines(candidate.activity.body).length <= 2 &&
      normalizedHeading(candidate.activity.body) === heading,
  );
}

function normalizedHeading(body: string): string | null {
  const first = meaningfulLines(body)[0];
  if (!first) {
    return null;
  }
  const normalized = first
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized === "" ? null : normalized;
}

function mergeRounds(into: PrReviewRound, from: PrReviewRound) {
  if (from.activity.body.length > into.activity.body.length) {
    into.verdictText = from.verdictText;
    into.severities = from.severities;
    into.gated = into.gated || from.gated;
    into.activity = from.activity;
  }
  if (from.activity.kind === "review" && from.activity.reviewState) {
    into.state = from.activity.reviewState;
  }
  if (from.threads.length > 0) {
    into.threads = [...into.threads, ...from.threads];
  }
}

function parseRound(
  activity: PrPaneActivity,
  threads: PrThreadEntry[],
  compiled: CompiledRules,
): PrReviewRound {
  const lines = meaningfulLines(activity.body);
  const verdictLine = lines.find((line) => compiled.verdictLine.test(line)) ?? null;
  const summaryLine =
    verdictLine ?? lines.find((line) => !line.startsWith("#")) ?? lines[0] ?? null;
  const severities = countSeverities(activity.body, compiled);
  return {
    activity,
    threads,
    verdictText: summaryLine ? cleanLine(summaryLine) : null,
    state: activity.reviewState ?? parseVerdictState(verdictLine, compiled),
    severities,
    gated: compiled.gate.test(activity.body),
    sha: lines[0] ? firstSha(lines[0]) : null,
  };
}

function parseVerdictState(verdictLine: string | null, compiled: CompiledRules): ReviewState {
  if (!verdictLine) {
    return "commented";
  }
  const line = verdictLine.toLowerCase();
  let found: { index: number; state: ReviewState } | null = null;
  for (const [phrase, state] of Object.entries(compiled.rules.verdictStates)) {
    const index = line.indexOf(phrase.toLowerCase());
    if (index !== -1 && (found === null || index < found.index)) {
      found = { index, state };
    }
  }
  return found?.state ?? "commented";
}

function countSeverities(body: string, compiled: CompiledRules): PrSeverityCount[] {
  const counts: PrSeverityCount[] = [];
  for (const severity of compiled.rules.severityTokens) {
    const escaped = escapeRegExp(severity.token);
    // "2 🔴" spells the count out; otherwise each occurrence is one finding.
    const explicit = [...body.matchAll(safeRegExp(`(\\d+)\\s*${escaped}`, "g") ?? /$^/g)].map(
      (match) => Number.parseInt(match[1], 10),
    );
    const count =
      explicit.length > 0 ? Math.max(...explicit) : body.split(severity.token).length - 1;
    if (count > 0) {
      counts.push({ token: severity.token, tone: severity.tone, count });
    }
  }
  // A spelled-out "(N blockers)" is the verdict's own count and outranks counting marks, which
  // overcounts when the body repeats one finding in a table and a fix list.
  const blockers = body.match(compiled.blockerCount);
  if (blockers) {
    const count = Number.parseInt(blockers[1], 10);
    const danger = counts.find((entry) => entry.tone === "danger");
    if (danger) {
      danger.count = count;
    } else if (count > 0) {
      counts.push({ token: "🔴", tone: "danger", count });
    }
    return counts.filter((entry) => entry.count > 0);
  }
  return counts;
}

function parseReport(
  activity: PrPaneActivity,
  compiled: CompiledRules,
): { key: string; entry: PrReportEntry } | null {
  const lines = meaningfulLines(activity.body).slice(0, 3);
  for (const line of lines) {
    const status = findStatusToken(line, compiled);
    if (!status) {
      continue;
    }
    const title = stripStatusTokens(line, compiled);
    if (title === "") {
      continue;
    }
    // Dashes vary between a report's own runs ("—" vs "-"), so they never make two keys.
    let key = title.toLowerCase().replace(/[—–-]+/g, " ");
    for (const strip of compiled.reportKeyStrips) {
      key = key.replace(strip, " ");
    }
    key = key.replace(/\s+/g, " ").trim();
    return {
      key: key === "" ? title.toLowerCase() : key,
      entry: {
        kind: "report",
        id: `report:${activity.id}`,
        title,
        status,
        activity,
        supersededCount: 0,
        sha: firstSha(activity.body),
      },
    };
  }
  return null;
}

function findStatusToken(line: string, compiled: CompiledRules): PrReportStatus | null {
  let found: { index: number; status: PrReportStatus } | null = null;
  for (const { token, status, word } of compiled.statusTokens) {
    const index = word ? (line.match(word)?.index ?? -1) : line.indexOf(token);
    if (index !== -1 && (found === null || index < found.index)) {
      found = { index, status };
    }
  }
  return found?.status ?? null;
}

function stripStatusTokens(line: string, compiled: CompiledRules): string {
  let text = cleanLine(line);
  for (const { token, word } of compiled.statusTokens) {
    text = word
      ? text.replace(safeRegExp(`\\b${escapeRegExp(token)}\\b`, "gi") ?? /$^/, " ")
      : text.split(token).join(" ");
  }
  return text
    .replace(/:[a-z0-9_+-]+:/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s—–:.-]+|[\s—–:.-]+$/g, "")
    .trim();
}
