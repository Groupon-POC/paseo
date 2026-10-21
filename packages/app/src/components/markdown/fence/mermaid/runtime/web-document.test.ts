// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the Mermaid frame document of a page that forbids inline script.
/**
 * Tests for the Mermaid frame document of a page that forbids inline script.
 *
 * Covers:  components/markdown/fence/mermaid/runtime/web-document.ts
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mermaidRuntimeScriptFile } from "./script-file.gen";
import { mermaidRuntimeFileHtml, shouldLoadMermaidRuntimeFromFile } from "./web-document";

const SCRIPT_URL = "https://desk.example.test/mermaid-runtime.abc123.js";

describe("mermaidRuntimeFileHtml", () => {
  const document = mermaidRuntimeFileHtml(SCRIPT_URL);

  it("loads the runtime from a file and carries no inline script", () => {
    expect(document).toContain(`<script src="${SCRIPT_URL}"></script>`);
    expect(document.match(/<script\b[^>]*>/g)).toEqual([`<script src="${SCRIPT_URL}">`]);
    expect(document).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("names the page's origin as the one script source and stays closed otherwise", () => {
    expect(document).toContain("script-src https://desk.example.test;");
    expect(document).toContain("default-src 'none'");
    expect(document).toContain("connect-src 'none'");
    expect(document).toContain("img-src data: blob:");
    expect(document).toContain("font-src 'none'");
    expect(document).toContain("frame-src 'none'");
    expect(document).toContain("base-uri 'none'");
  });

  it("keeps the diagram element the runtime renders into", () => {
    expect(document).toContain('<div id="diagram"></div>');
  });
});

describe("shouldLoadMermaidRuntimeFromFile", () => {
  it("is true over http(s) and false for Electron's scheme, file and native", () => {
    expect(shouldLoadMermaidRuntimeFromFile("https:")).toBe(true);
    expect(shouldLoadMermaidRuntimeFromFile("http:")).toBe(true);
    expect(shouldLoadMermaidRuntimeFromFile("groupon-desk:")).toBe(false);
    expect(shouldLoadMermaidRuntimeFromFile("file:")).toBe(false);
  });
});

describe("the runtime file", () => {
  it("is in public/, where the export serves it from", () => {
    expect(mermaidRuntimeScriptFile).toMatch(/^mermaid-runtime\.[0-9a-f]+\.js$/);
    expect(
      existsSync(path.resolve(__dirname, "../../../../../../public", mermaidRuntimeScriptFile)),
    ).toBe(true);
  });
});
