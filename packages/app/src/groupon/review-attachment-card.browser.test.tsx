// Added for Groupon Desk (fork of Paseo, Apache-2.0): browser tests for the chat card of a review sent from the diff.

/**
 * Tests for the review card in a user message.
 *
 * Covers: packages/app/src/groupon/review-attachment-card.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { ReviewAttachment, ReviewAttachmentComment } from "./review-attachment-model";

const opened: Array<{ path: string; line: number }> = [];
vi.mock("./use-open-review-comment", () => ({
  useOpenReviewComment: () => (_attachment: unknown, comment: ReviewAttachmentComment) =>
    opened.push({ path: comment.filePath, line: comment.lineNumber }),
}));

const { ReviewAttachmentCard } = await import("./review-attachment-card");

const comment = (filePath: string, lineNumber: number, body: string): ReviewAttachmentComment => ({
  filePath,
  side: "new",
  lineNumber,
  body,
  context: {
    hunkHeader: "@@ -1,3 +1,4 @@",
    targetLine: {
      oldLineNumber: null,
      newLineNumber: lineNumber,
      type: "add",
      content: "const value = maybeNull.name;",
    },
    lines: [],
  },
});

const review: ReviewAttachment = {
  type: "review",
  mimeType: "application/paseo-review",
  cwd: "/r/paseo",
  mode: "all",
  baseRef: "groupon-session",
  comments: [
    comment("packages/app/src/git/diff-pane.tsx", 42, "Guard this nullable value."),
    comment("README.md", 7, "Say what the switch does."),
  ],
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  opened.length = 0;
  host = document.createElement("div");
  host.style.cssText = "width:640px;padding:16px;background:#202020;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the chat card of a review sent from the diff", () => {
  it("names the comparison, each comment's file, line, code and text, and opens a comment's line", async () => {
    act(() => root?.render(<ReviewAttachmentCard attachment={review} serverId="s" agentId="a" />));
    const text = host!.textContent ?? "";

    expect(text).toContain("Code review · 2 comments · Session");
    expect(text).toContain("diff-pane.tsx:42");
    expect(text).toContain("packages/app/src/git");
    expect(text).toContain("+ const value = maybeNull.name;");
    expect(text).toContain("Guard this nullable value.");
    await page.screenshot({ path: "/tmp/review-card.png" });

    const rows = host!.querySelectorAll<HTMLElement>('[data-testid="review-attachment-comment"]');
    act(() => rows[1]!.click());
    expect(opened).toEqual([{ path: "README.md", line: 7 }]);
  });
});
