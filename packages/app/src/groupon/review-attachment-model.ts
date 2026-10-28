// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a review sent from the diff says in the chat, and where its comments open.

/**
 * A review sent from the diff reaches the agent as a `review` attachment (Paseo's protocol): the
 * comparison it was made on and each comment with its file, side, line and code around it. The
 * chat shows it as a card (`review-attachment-card.tsx`) whose comments open the diff at their line.
 */

import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { WorkingDiffComparison } from "@/git/working-diff-comparison/state";
import { GROUPON_REVIEW_CARD } from "./strings";

export type ReviewAttachment = Extract<AgentAttachment, { type: "review" }>;
export type ReviewAttachmentComment = ReviewAttachment["comments"][number];

/** The review base `use-compared-diff.ts` gives a review of the session's diff. */
const SESSION_REVIEW_BASE = "groupon-session";

/** The comparison the review was made on, to open its comments in the same one. */
export function reviewComparisonOf(attachment: ReviewAttachment): WorkingDiffComparison {
  return attachment.baseRef === SESSION_REVIEW_BASE ? "session" : attachment.mode;
}

/** The comparison in words, for the card's heading. */
export function reviewScopeLabel(attachment: ReviewAttachment): string {
  const comparison = reviewComparisonOf(attachment);
  if (comparison === "session") return GROUPON_REVIEW_CARD.session;
  if (comparison === "uncommitted") return GROUPON_REVIEW_CARD.uncommitted;
  if (comparison === "base") return GROUPON_REVIEW_CARD.committed(attachment.baseRef ?? null);
  return GROUPON_REVIEW_CARD.all;
}

/** Where a comment points: the file's name, its folder, and the line ("old" for a removed side). */
export function reviewCommentPlace(comment: ReviewAttachmentComment): {
  name: string;
  folder: string;
  line: string;
} {
  const slash = comment.filePath.lastIndexOf("/");
  return {
    name: slash < 0 ? comment.filePath : comment.filePath.slice(slash + 1),
    folder: slash < 0 ? "" : comment.filePath.slice(0, slash),
    line:
      comment.side === "old"
        ? `${GROUPON_REVIEW_CARD.oldLine} ${comment.lineNumber}`
        : `${comment.lineNumber}`,
  };
}

const LINE_MARKERS = { add: "+", remove: "-", context: " " } as const;

/** The commented code line as the diff shows it: its +, - or space, then its text. */
export function reviewTargetLine(comment: ReviewAttachmentComment): {
  marker: "+" | "-" | " ";
  type: "add" | "remove" | "context";
  text: string;
} {
  const line = comment.context.targetLine;
  return { marker: LINE_MARKERS[line.type], type: line.type, text: line.content };
}
