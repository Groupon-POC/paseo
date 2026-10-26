// Changed for Groupon Desk (fork of Paseo, Apache-2.0): on a page served over http(s) the preview is a frame loaded from a URL (html-preview-frame.ts), because the page's policy forbids inline script and a srcdoc frame inherits it.
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { withPreviewCsp } from "./html-preview-csp";
import {
  HTML_PREVIEW_FRAME_ACK_TIMEOUT_MS,
  HTML_PREVIEW_FRAME_LOAD_TIMEOUT_MS,
  HTML_PREVIEW_FRAME_PATH,
  htmlPreviewDocumentMessage,
  isHtmlPreviewReceivedMessage,
  shouldUseHtmlPreviewFrame,
} from "./html-preview-frame";

// `allow-scripts` alone: the file gets an opaque origin, so a plan page can run
// its own scripts (Excalidraw, charts) but cannot reach the Paseo app's DOM,
// cookies, or storage, and cannot navigate the top window. Agent-written HTML is
// not trusted markup. No popup tokens — a preview is a viewer, not a browser, and
// escaping the sandbox to open one buys nothing for reading a local plan. The same
// isolation means storage APIs throw inside the frame; pages that want to persist
// state have to export.
//
// A sandboxed frame may still navigate *itself*, and nothing in CSP stops that
// (see html-preview-csp.ts). That is the one hole left on web, it is bounded to
// the page's own contents, and it is documented in SECURITY.md rather than papered
// over with a directive browsers ignore.
const SANDBOX = "allow-scripts";

const iframeStyle = {
  flex: 1,
  minHeight: 0,
  border: "none",
  backgroundColor: "white",
} as const;

let nextRevision = 0;

interface PreviewFrameProps {
  document: string;
  testID?: string;
  title: string;
  onUnavailable: () => void;
}

/** Loads the frame document, hands it the page, and gives up when the frame does not answer. */
function UrlPreviewFrame({ document, testID, title, onUnavailable }: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const posted = useRef(false);
  const ackTimer = useRef<number | undefined>(undefined);
  const loadTimer = useRef<number | undefined>(undefined);

  useLayoutEffect(() => {
    loadTimer.current = window.setTimeout(onUnavailable, HTML_PREVIEW_FRAME_LOAD_TIMEOUT_MS);
    function receive(event: MessageEvent): void {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isHtmlPreviewReceivedMessage(event.data)) return;
      window.clearTimeout(loadTimer.current);
      window.clearTimeout(ackTimer.current);
    }
    window.addEventListener("message", receive);
    return () => {
      window.clearTimeout(loadTimer.current);
      window.clearTimeout(ackTimer.current);
      window.removeEventListener("message", receive);
    };
  }, [onUnavailable]);

  // The frame's own load fires once its script listens; writing the page fires it again. A frame
  // the browser refused (no server location for it) loads an error page that never answers.
  const sendDocument = useCallback(() => {
    if (posted.current) return;
    posted.current = true;
    ackTimer.current = window.setTimeout(onUnavailable, HTML_PREVIEW_FRAME_ACK_TIMEOUT_MS);
    frameRef.current?.contentWindow?.postMessage(htmlPreviewDocumentMessage(document), "*");
  }, [document, onUnavailable]);

  return (
    <iframe
      ref={frameRef}
      data-testid={testID}
      title={title}
      src={HTML_PREVIEW_FRAME_PATH}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      onLoad={sendDocument}
      style={iframeStyle}
    />
  );
}

export function FileHtmlPreview({ html, testID }: { html: string; testID?: string }) {
  const { t } = useTranslation();
  // A new document is a new frame: the written page replaces the frame's script, so it cannot be told again.
  const { document, revision } = useMemo(
    () => ({ document: withPreviewCsp(html), revision: nextRevision++ }),
    [html],
  );
  const [frameUnavailable, setFrameUnavailable] = useState(false);
  const markFrameUnavailable = useCallback(() => setFrameUnavailable(true), []);
  const title = t("panels.file.filePanels.builtin.html");

  if (shouldUseHtmlPreviewFrame(window.location.protocol) && !frameUnavailable) {
    return (
      <UrlPreviewFrame
        key={revision}
        document={document}
        testID={testID}
        title={title}
        onUnavailable={markFrameUnavailable}
      />
    );
  }
  return (
    <iframe
      data-testid={testID}
      title={title}
      srcDoc={document}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      style={iframeStyle}
    />
  );
}
