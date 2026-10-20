// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the Encore card says, as pure functions.

/**
 * The words of a project's Encore card (`encore-state-section.tsx`): a rollout in one line, the
 * person's standing, when "Ask for access" is offered, and the release train's checks. Pure, so
 * the card's wording is tested without rendering it.
 */

import type { EncoreAppState, EncoreRollout, ReleaseTrain } from "./desk-plugin-rpc";
import { GROUPON_ENCORE } from "./strings";

/** The card reads again this often while it is on screen. */
export const ENCORE_REFRESH_MS = 60_000;

/** `2026-10-19 08:11 UTC`: a time the same on every Mac, as the dashboard and the CLI give it. */
export function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/** What happened to the rollout, in a word: its conclusion once completed, else where it is. */
export function rolloutOutcome(rollout: EncoreRollout): string {
  return rollout.status === "completed" ? rollout.conclusion : rollout.status;
}

/** One environment's latest rollout as a line: outcome, commit, time. */
export function rolloutLine(rollout: EncoreRollout | null): string {
  if (rollout === null) return GROUPON_ENCORE.noRollout;
  const when = shortTime(rollout.completedAt ?? rollout.startedAt ?? rollout.queuedAt);
  return [rolloutOutcome(rollout), rollout.commitShort, when].filter(Boolean).join(" · ");
}

/** The tone of a rollout's line: a failure stands out, one in flight is muted. */
export function rolloutTone(rollout: EncoreRollout | null): "good" | "bad" | "neutral" {
  if (rollout === null || rollout.status !== "completed") return "neutral";
  if (rollout.conclusion === "success") return "good";
  return "bad";
}

/** What the standing's words and the access offer read: a project's app and a catalog app alike. */
type Standing = Pick<EncoreAppState, "standing" | "role" | "requestPending" | "approver">;

/** The person's standing on the app, in a sentence. */
export function standingText(app: Standing): string {
  switch (app.standing) {
    case "member":
      return app.role ? `${GROUPON_ENCORE.member} (${app.role})` : GROUPON_ENCORE.member;
    case "invited":
      return GROUPON_ENCORE.invited;
    case "not-member":
      return app.requestPending
        ? `${GROUPON_ENCORE.requestWaiting}${app.approver ? ` ${GROUPON_ENCORE.decidedBy} ${app.approver}` : ""}`
        : GROUPON_ENCORE.notMember;
    case "unknown":
      return app.requestPending ? GROUPON_ENCORE.requestWaiting : GROUPON_ENCORE.unknown;
    case "not-handed-out":
      return GROUPON_ENCORE.notHandedOut;
    default: {
      const exhaustive: never = app.standing;
      return exhaustive;
    }
  }
}

/**
 * "Ask for access" is offered to somebody who is not a member, and to somebody nobody could say
 * about (with the sentence that it files a request), unless a request of theirs already waits.
 */
export function accessOffer(app: Standing): "none" | "ask" | "ask-unknown" {
  if (app.requestPending === true) return "none";
  if (app.standing === "not-member") return "ask";
  if (app.standing === "unknown") return "ask-unknown";
  return "none";
}

/** The tone of the train's line: failing checks stand out, passing ones read as good. */
export function trainTone(train: ReleaseTrain): "good" | "bad" | "neutral" {
  if (train.checks === "failing") return "bad";
  if (train.checks === "passing") return "good";
  return "neutral";
}

export function checksText(train: ReleaseTrain): string {
  return GROUPON_ENCORE.checks[train.checks];
}
