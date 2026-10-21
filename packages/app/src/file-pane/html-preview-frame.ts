// Added for Groupon Desk (fork of Paseo, Apache-2.0): the HTML preview's frame document, for a page whose policy forbids inline script.

import { HTML_PREVIEW_POLICY } from "./html-preview-csp";

/**
 * The work window on the web is served with `script-src 'self'`, no `'unsafe-inline'`, and a
 * `srcdoc` frame inherits that policy (a meta policy inside the frame can only narrow it,
 * measured in Chromium), so an agent-written page with an inline script cannot run in one. A
 * frame loaded from a URL has its own response policy instead. The preview therefore loads
 * `public/html-preview-frame.html`, a few lines that wait for the page's document by
 * `postMessage` and write it into the frame. The server answers that one path with
 * `HTML_PREVIEW_FRAME_RESPONSE_POLICY` and lets the app frame it (the deploy's nginx location);
 * every other path keeps the strict policy.
 *
 * Where the frame does not answer (a server without that location sends X-Frame-Options DENY
 * and the browser refuses the frame), the preview falls back to `srcdoc` after
 * a short timeout, as before: the markup still shows, its scripts do not run.
 */

export const HTML_PREVIEW_FRAME_PATH = "/html-preview-frame.html";

/** What the server sends with the frame document: the preview's own policy, and the app may frame it. */
export const HTML_PREVIEW_FRAME_RESPONSE_POLICY = `${HTML_PREVIEW_POLICY}; frame-ancestors 'self'`;

/** After the frame loaded and was handed the page: how long it has to say it wrote it. */
export const HTML_PREVIEW_FRAME_ACK_TIMEOUT_MS = 1500;

/** For a frame that never loads at all. */
export const HTML_PREVIEW_FRAME_LOAD_TIMEOUT_MS = 6000;

const DOCUMENT_MESSAGE = "paseo-html-preview-document";
const RECEIVED_MESSAGE = "paseo-html-preview-received";

/** Pages served over http(s) use the frame document; Electron's own scheme and native keep `srcdoc`. */
export function shouldUseHtmlPreviewFrame(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

export function htmlPreviewDocumentMessage(html: string): { type: string; html: string } {
  return { type: DOCUMENT_MESSAGE, html };
}

/** The frame's answer when it has the document, before it writes it. */
export function isHtmlPreviewReceivedMessage(data: unknown): boolean {
  return (
    typeof data === "object" && data !== null && Reflect.get(data, "type") === RECEIVED_MESSAGE
  );
}
