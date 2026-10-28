// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the chat card of a review sent from the diff.

import { describe, expect, it } from "vitest";
import {
  reviewCommentPlace,
  reviewComparisonOf,
  reviewScopeLabel,
  reviewTargetLine,
  type ReviewAttachment,
  type ReviewAttachmentComment,
} from "./review-attachment-model";

const comment = (overrides: Partial<ReviewAttachmentComment> = {}): ReviewAttachmentComment => ({
  filePath: "packages/app/src/git/diff-pane.tsx",
  side: "new",
  lineNumber: 42,
  body: "Guard this.",
  context: {
    hunkHeader: "@@ -40,3 +40,4 @@",
    targetLine: { oldLineNumber: null, newLineNumber: 42, type: "add", content: "const a = b.c;" },
    lines: [],
  },
  ...overrides,
});

const review = (overrides: Partial<ReviewAttachment>): ReviewAttachment => ({
  type: "review",
  mimeType: "application/paseo-review",
  cwd: "/r/paseo",
  mode: "all",
  baseRef: null,
  comments: [comment()],
  ...overrides,
});

describe("the chat card of a review sent from the diff", () => {
  it("opens a session review in the session comparison and names each comparison", () => {
    expect(reviewComparisonOf(review({ baseRef: "groupon-session" }))).toBe("session");
    expect(reviewComparisonOf(review({ mode: "base", baseRef: "main" }))).toBe("base");
    expect(reviewScopeLabel(review({ baseRef: "groupon-session" }))).toBe("Session");
    expect(reviewScopeLabel(review({ mode: "base", baseRef: "main" }))).toBe(
      "Committed since main",
    );
    expect(reviewScopeLabel(review({ mode: "uncommitted" }))).toBe("Uncommitted");
    expect(reviewScopeLabel(review({}))).toBe("All changes");
  });

  it("says where a comment points and shows its line as the diff does", () => {
    expect(reviewCommentPlace(comment())).toEqual({
      name: "diff-pane.tsx",
      folder: "packages/app/src/git",
      line: "42",
    });
    expect(reviewCommentPlace(comment({ filePath: "README.md", side: "old" }))).toEqual({
      name: "README.md",
      folder: "",
      line: "old 42",
    });
    expect(reviewTargetLine(comment())).toEqual({
      marker: "+",
      type: "add",
      text: "const a = b.c;",
    });
  });
});
