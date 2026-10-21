// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Mermaid frame's document for a page whose policy forbids inline script.

/**
 * The work window on the web is served with `script-src 'self'`, no `'unsafe-inline'`. A `srcdoc`
 * or `blob:` frame inherits its creator's policy (measured in Chromium: a meta policy inside the
 * frame can only narrow it), so the inline copy of the runtime (`html.gen.ts`) cannot run there.
 * The same bundle is also written as a file under `public/` (`build-runtime.mjs`), and this
 * document loads it from the page's own origin, which `script-src 'self'` admits.
 */

/** Pages served over http(s) load the runtime as a file; Electron's own scheme and native keep the inline copy. */
export function shouldLoadMermaidRuntimeFromFile(protocol: string): boolean {
  return protocol === "http:" || protocol === "https:";
}

/** The frame's closed network policy, with its one script source named by origin (a sandboxed frame's `'self'` is opaque). */
export function mermaidRuntimeFileHtml(scriptUrl: string): string {
  const { origin } = new URL(scriptUrl);
  const policy = [
    "default-src 'none'",
    `script-src ${origin}`,
    "style-src 'unsafe-inline'",
    "connect-src 'none'",
    "img-src data: blob:",
    "font-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${policy}" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: transparent;
        height: 100%;
      }
      /* The host sizes this frame to the diagram, so the diagram fills the frame. */
      #diagram {
        height: 100%;
      }
      #diagram svg {
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="diagram"></div>
    <script src="${scriptUrl}"></script>
  </body>
</html>`;
}
