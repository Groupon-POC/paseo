// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the HTML preview's frame document.
/**
 * Tests for the HTML preview's frame document.
 *
 * Covers:  file-pane/html-preview-frame.ts, public/html-preview-frame.html
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HTML_PREVIEW_POLICY, withPreviewCsp } from "@/file-pane/html-preview-csp";
import {
  HTML_PREVIEW_FRAME_PATH,
  HTML_PREVIEW_FRAME_RESPONSE_POLICY,
  htmlPreviewDocumentMessage,
  isHtmlPreviewReceivedMessage,
  shouldUseHtmlPreviewFrame,
} from "@/file-pane/html-preview-frame";

const frameDocument = readFileSync(
  path.resolve(__dirname, "../../public", HTML_PREVIEW_FRAME_PATH.slice(1)),
  "utf8",
);

describe("the preview frame's response policy", () => {
  it("is the preview's own policy, plus permission for the app to frame it", () => {
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).toBe(
      `${HTML_PREVIEW_POLICY}; frame-ancestors 'self'`,
    );
  });

  it("is never wider than the policy the document sets for itself", () => {
    const meta = withPreviewCsp("");
    expect(meta).toContain(`content="${HTML_PREVIEW_POLICY}"`);
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).toContain("default-src 'none'");
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).toContain("connect-src 'none'");
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).toContain("frame-src 'none'");
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).not.toMatch(
      /(script|img|connect|style)-src[^;]*https?:/,
    );
    expect(HTML_PREVIEW_FRAME_RESPONSE_POLICY).not.toContain("frame-ancestors *");
  });
});

describe("the preview frame's choice", () => {
  it("uses the frame document on http(s) pages only", () => {
    expect(shouldUseHtmlPreviewFrame("https:")).toBe(true);
    expect(shouldUseHtmlPreviewFrame("http:")).toBe(true);
    expect(shouldUseHtmlPreviewFrame("groupon-desk:")).toBe(false);
    expect(shouldUseHtmlPreviewFrame("file:")).toBe(false);
  });
});

describe("the preview frame's messages", () => {
  it("carries the page's document, and recognizes the frame's answer", () => {
    const message = htmlPreviewDocumentMessage("<h1>Plan</h1>");
    expect(message.html).toBe("<h1>Plan</h1>");
    expect(isHtmlPreviewReceivedMessage({ type: "paseo-html-preview-received" })).toBe(true);
    expect(isHtmlPreviewReceivedMessage({ type: "other" })).toBe(false);
    expect(isHtmlPreviewReceivedMessage(null)).toBe(false);
    expect(isHtmlPreviewReceivedMessage("paseo-html-preview-received")).toBe(false);
  });

  it("matches what the static frame document listens for and answers", () => {
    expect(frameDocument).toContain(`"${htmlPreviewDocumentMessage("").type}"`);
    expect(frameDocument).toContain('type: "paseo-html-preview-received"');
    expect(frameDocument.indexOf("paseo-html-preview-received")).toBeLessThan(
      frameDocument.indexOf("document.write"),
    );
    expect(isHtmlPreviewReceivedMessage({ type: "paseo-html-preview-received" })).toBe(true);
  });

  it("only takes the document from its parent, once", () => {
    expect(frameDocument).toContain("event.source !== window.parent");
    expect(frameDocument).toContain('removeEventListener("message", receive)');
  });
});
