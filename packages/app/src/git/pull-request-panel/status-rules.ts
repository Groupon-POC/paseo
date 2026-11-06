// Added for Groupon Desk (fork of Paseo, Apache-2.0): the tunable rules behind the PR activity
// status mode. The parser reads only these rules, so when a bot rewords its comments the fix is a
// JSON edit — in the repo's `.desk/pr-activity-rules.json` — not an app release.

import { z } from "zod";

/** What a parsed report row means, mapped onto the checks' presentation tones. */
export const PR_REPORT_STATUSES = ["success", "failure", "pending", "warning", "info"] as const;
export type PrReportStatus = (typeof PR_REPORT_STATUSES)[number];

const ReportStatusSchema = z.enum(PR_REPORT_STATUSES);

const SeverityTokenSchema = z.object({
  /** The literal emoji (or any substring) counted in a review body. */
  token: z.string().min(1),
  tone: z.enum(["danger", "warning", "info", "muted"]),
});

export const PrStatusRulesSchema = z.object({
  /**
   * Substrings that mark a comment's first lines as a machine report and carry its status.
   * Emoji, GitHub shortcodes and plain words all work; longer tokens match first.
   */
  statusTokens: z.record(z.string(), ReportStatusSchema),
  /** Severity marks counted across a review round's body, in display order. */
  severityTokens: z.array(SeverityTokenSchema),
  /** Finds the verdict line of a review round (regex, case-insensitive, per line). */
  verdictLinePattern: z.string(),
  /** Phrases inside the verdict line that decide the round's state (lowercased substring). */
  verdictStates: z.record(z.string(), z.enum(["approved", "changes_requested", "commented"])),
  /** Counts spelled-out blockers when no severity emoji is present (regex with one group). */
  blockerCountPattern: z.string(),
  /** Marks a round as a hard gate (regex, case-insensitive). */
  gatePattern: z.string(),
  /** A whole comment body that is a slash command (regex, case-insensitive). */
  commandPattern: z.string(),
  /** Transient notices that carry no status and stay in the conversation (regex, each). */
  noticePatterns: z.array(z.string()),
  /** Stripped from a report's title before it becomes the supersede key (regex, each). */
  reportKeyStripPatterns: z.array(z.string()),
});

export type PrStatusRules = z.infer<typeof PrStatusRulesSchema>;

export const DEFAULT_PR_STATUS_RULES: PrStatusRules = {
  statusTokens: {
    "✅": "success",
    "☑️": "success",
    "✔️": "success",
    ":white_check_mark:": "success",
    ":heavy_check_mark:": "success",
    passed: "success",
    succeeded: "success",
    "❌": "failure",
    "✖️": "failure",
    ":x:": "failure",
    failed: "failure",
    failing: "failure",
    "🔄": "pending",
    "⏳": "pending",
    ":hourglass:": "pending",
    running: "pending",
    "in progress": "pending",
    "⚠️": "warning",
    ":warning:": "warning",
    ℹ️: "info",
    ":information_source:": "info",
    "heads up": "info",
    "heads-up": "info",
    "⏭️": "info",
    ":fast_forward:": "info",
    skipped: "info",
  },
  severityTokens: [
    { token: "🔴", tone: "danger" },
    { token: "🟠", tone: "warning" },
    { token: "🟡", tone: "warning" },
    { token: "🔵", tone: "info" },
  ],
  verdictLinePattern: "\\bverdict\\b",
  verdictStates: {
    request_changes: "changes_requested",
    "request changes": "changes_requested",
    "changes requested": "changes_requested",
    changes_requested: "changes_requested",
    "request-changes": "changes_requested",
    blocked: "changes_requested",
    approve: "approved",
    lgtm: "approved",
  },
  blockerCountPattern: "(\\d+)\\s+blockers?\\b",
  gatePattern: "⛔|\\bBLOCKED\\b",
  commandPattern: "^/[a-z][\\w-]*\\s*$",
  noticePatterns: ["picked up this pull request"],
  reportKeyStripPatterns: ["\\b[0-9a-f]{7,40}\\b", "\\bcommit\\b", "\\b\\d+\\b", "[—–-]+\\s*$"],
};

/**
 * Lays a partial override from `.desk/pr-activity-rules.json` over the defaults. Scalar fields
 * replace; `statusTokens` and `verdictStates` merge per key so an override can add one bot's
 * wording without restating the defaults. Anything that fails the schema is ignored whole.
 */
export function mergePrStatusRules(override: unknown): PrStatusRules {
  const parsed = PrStatusRulesSchema.partial().safeParse(override);
  if (!parsed.success) {
    return DEFAULT_PR_STATUS_RULES;
  }
  const next = parsed.data;
  return {
    ...DEFAULT_PR_STATUS_RULES,
    ...next,
    statusTokens: { ...DEFAULT_PR_STATUS_RULES.statusTokens, ...next.statusTokens },
    verdictStates: { ...DEFAULT_PR_STATUS_RULES.verdictStates, ...next.verdictStates },
  };
}
