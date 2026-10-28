// Added for Groupon Desk (fork of Paseo, Apache-2.0): browser tests for the diff viewer's open button and the file it reports in view.

/**
 * Tests for the web diff surface's header open button and visible-file report.
 *
 * Covers: packages/app/src/git/diff-document/surface.web.tsx
 */

import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiffSurface } from "./surface.web";
import type { DiffPalette, WorkingDiffMode } from "./types";
import { DiffDocumentWorkspaceCacheProvider } from "./workspace-cache";

const palette: DiffPalette = {
  surface: "#111111",
  headerSurface: "#222222",
  border: "#333333",
  foreground: "#eeeeee",
  foregroundMuted: "#999999",
  addition: "#22aa22",
  deletion: "#aa2222",
  additionBackground: "#113311",
  deletionBackground: "#331111",
  emptyBackground: "#111111",
  selection: "#3355ff",
  headerActiveSurface: "#2a2a2a",
  headerBorder: "#444444",
  statusSuccess: "#22aa22",
  statusDanger: "#aa2222",
  statusWarning: "#aaaa22",
  syntax: {},
} as unknown as DiffPalette;

// The toast host imports Android-only React Native modules the browser project cannot load.
vi.mock("@/components/toast-host", () => ({
  useToastHost: () => ({ api: null, toast: null, dismiss: () => {} }),
  ToastViewport: () => null,
}));
// Review threads are not under test here, and their styles read theme keys the stub theme lacks.
vi.mock("@/review", () => ({ InlineReviewAddButton: () => null, InlineReviewThread: () => null }));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: () => () => {}, copied: () => {}, error: () => {} }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function file(path: string, lineCount: number): ParsedDiffFile {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions: lineCount,
    deletions: 0,
    hunks: [
      {
        oldStart: 1,
        oldCount: 0,
        newStart: 1,
        newCount: lineCount,
        lines: [
          { type: "header", content: `@@ -0,0 +1,${lineCount} @@` },
          ...Array.from({ length: lineCount }, (_, index) => ({
            type: "add" as const,
            content: `const line${index} = ${index};`,
          })),
        ],
      },
    ],
  };
}

const FILES = [file("src/first.ts", 40), file("src/deep/second.ts", 40), file("third.ts", 40)];
const DISPLAY = {
  layout: "unified" as const,
  wrapLines: false,
  codeFontSize: 12,
  monoFontFamily: "",
};
const NO_PATHS = new Set<string>();
const COLLAPSE_STATE = { paths: [], onChange: noop };
const HEADER_TYPOGRAPHY = { family: "system-ui", size: 13, statSize: 11 };

function noop(): void {}

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function renderSurface(mode: WorkingDiffMode) {
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:0;top:0;width:700px;height:300px;display:flex;";
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root?.render(
      <DiffDocumentWorkspaceCacheProvider>
        <DiffSurface
          files={FILES}
          displayPreferences={DISPLAY}
          mode={mode}
          collapseState={COLLAPSE_STATE}
          palette={palette}
          headerTypography={HEADER_TYPOGRAPHY}
          collapsedFilePaths={NO_PATHS}
          onToggleFile={noop}
          selectedPath={null}
          onSelectPath={noop}
        />
      </DiffDocumentWorkspaceCacheProvider>,
    ),
  );
}

async function settle() {
  for (let frame = 0; frame < 5; frame += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

describe("the diff viewer's file headers", () => {
  it("opens the whole file from the button right after its path", async () => {
    const onOpenFile = vi.fn();
    renderSurface({ kind: "working", onOpenFile, onVisibleFileChange: noop });
    await settle();

    const button = document.querySelector<HTMLButtonElement>('[data-testid="diff-file-0-open"]');
    expect(button).not.toBeNull();
    const left = Number.parseFloat(button!.style.left);
    // After the painted name and folder, well before the +/- counts on the right.
    expect(left).toBeGreaterThan(40);
    expect(left).toBeLessThan(300);

    act(() => button!.click());
    expect(onOpenFile).toHaveBeenCalledWith("src/first.ts");
  });

  it("tells which file reached the top of the viewport as the diff scrolls", async () => {
    const onVisibleFileChange = vi.fn();
    renderSurface({ kind: "working", onOpenFile: noop, onVisibleFileChange });
    await settle();
    expect(onVisibleFileChange).toHaveBeenLastCalledWith("src/first.ts");

    const scroll = document.querySelector<HTMLDivElement>('[data-testid="git-diff-scroll"]')!;
    const second = document.querySelector<HTMLElement>(
      '[data-diff-header-path="src/deep/second.ts"]',
    );
    const secondTop = second?.parentElement ? Number.parseFloat(second.parentElement.style.top) : 0;
    expect(secondTop).toBeGreaterThan(0);
    scroll.scrollTop = secondTop + 10;
    scroll.dispatchEvent(new Event("scroll"));
    await settle();
    expect(onVisibleFileChange).toHaveBeenLastCalledWith("src/deep/second.ts");

    scroll.scrollTop = scroll.scrollHeight;
    scroll.dispatchEvent(new Event("scroll"));
    await settle();
    expect(onVisibleFileChange).toHaveBeenLastCalledWith("third.ts");
  });
});
