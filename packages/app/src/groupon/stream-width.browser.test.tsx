// Added for Groupon Desk (fork of Paseo, Apache-2.0): the agent output widened while a long chat streams, in a real browser: no update loop, no overlapping rows, no endless scroll.

/**
 * Tests for the agent output's width through the web chat list.
 *
 * Covers: packages/app/src/groupon/stream-width.ts
 */

import React, { act, useMemo, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { View } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebStreamStrategy } from "@/agent-stream/strategy-web";
import type { StreamSegmentRenderers, StreamViewportHandle } from "@/agent-stream/strategy";
import type { StreamItem } from "@/types/stream";
import { StreamWidthProvider, useStreamRowWidthStyle } from "./stream-width";

const CONTENT_MAX_WIDTH = 820;
const WIDENED = 1280;
const PARAGRAPH =
  "The agent reads the repository, runs the tests and writes a long answer that wraps over several lines in a narrow column. ";

function message(index: number): StreamItem {
  return {
    kind: "user_message",
    id: `message-${index}`,
    text: PARAGRAPH.repeat(1 + (index % 5)),
    timestamp: new Date(Date.UTC(2026, 9, 28, 0, 0, index)),
  };
}

const ROW_STYLE = { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" } as const;
const TEXT_STYLE: React.CSSProperties = {
  font: "14px/20px system-ui",
  margin: 0,
  padding: "4px 8px",
};

function Row({ item }: { item: StreamItem }): ReactNode {
  const widthStyle = useStreamRowWidthStyle();
  const style = useMemo(() => [ROW_STYLE, widthStyle], [widthStyle]);
  return (
    <View style={style}>
      <p style={TEXT_STYLE}>{item.kind === "user_message" ? item.text : item.id}</p>
    </View>
  );
}

const renderRow = (item: StreamItem) => <Row item={item} />;
const RENDERERS: StreamSegmentRenderers = {
  renderHistoryVirtualizedRow: renderRow,
  renderHistoryMountedRow: renderRow,
  renderLiveHeadRow: renderRow,
  renderLiveAuxiliary: () => null,
};
const strategy = createWebStreamStrategy({ isMobileBreakpoint: false });
const noop = () => {};
const loadOlder = () => true;

let setters: { width: (width: number | null) => void; live: (items: StreamItem[]) => void } | null =
  null;

function Chat({ history }: { history: StreamItem[] }): ReactNode {
  const [width, setWidth] = useState<number | null>(null);
  const [live, setLive] = useState<StreamItem[]>([]);
  setters = { width: setWidth, live: setLive };
  const viewportRef = React.useRef<StreamViewportHandle | null>(null);
  const segments = useMemo(
    () => ({ historyVirtualized: history, historyMounted: [], liveHead: live }),
    [history, live],
  );
  const boundary = useMemo(
    () => ({ hasVirtualizedHistory: true, hasMountedHistory: false, hasLiveHead: live.length > 0 }),
    [live.length],
  );
  return (
    <StreamWidthProvider value={width}>
      {strategy.render({
        agentId: "agent",
        segments,
        boundary,
        renderers: RENDERERS,
        listEmptyComponent: null,
        viewportRef,
        routeBottomAnchorRequest: null,
        isAuthoritativeHistoryReady: true,
        onNearBottomChange: noop,
        onNearHistoryStart: loadOlder,
        isLoadingOlderHistory: false,
        hasOlderHistory: false,
        olderHistoryProgressKey: null,
        scrollEnabled: true,
        listStyle: null,
        baseListContentContainerStyle: null,
        forwardListContentContainerStyle: null,
        contentMaxWidth: width ?? CONTENT_MAX_WIDTH,
      })}
    </StreamWidthProvider>
  );
}

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let errors: string[] = [];

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  setters = null;
  vi.restoreAllMocks();
});

async function frames(count: number) {
  for (let frame = 0; frame < count; frame += 1) {
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
}

function scroller(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-testid="agent-chat-scroll"]')!;
}

/** A reader's wheel upward to `top`: the list stops following the output. */
function scrollUpTo(list: HTMLElement, top: number) {
  list.dispatchEvent(new WheelEvent("wheel", { deltaY: -900, bubbles: true }));
  list.scrollTop = top;
  list.dispatchEvent(new Event("scroll"));
}

/** The rendered rows' boxes, top to bottom; any two that overlap are a broken layout. */
function overlaps(): string[] {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-history-row-id]"))
    .map((element) => ({ id: element.dataset.historyRowId!, box: element.getBoundingClientRect() }))
    .sort((a, b) => a.box.top - b.box.top);
  const found: string[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1]!;
    const current = rows[index]!;
    if (current.box.top < previous.box.bottom - 1) found.push(`${previous.id}/${current.id}`);
  }
  return found;
}

describe("the agent output widened in a long, live chat", () => {
  it("lays the rows out again once, keeps them apart, and stops scrolling when the stream stops", async () => {
    host = document.createElement("div");
    host.style.cssText = "position:fixed;left:0;top:0;width:1600px;height:700px;display:flex;";
    document.body.appendChild(host);
    root = createRoot(host);
    const history = Array.from({ length: 240 }, (_, index) => message(index));
    act(() => root?.render(<Chat history={history} />));
    await frames(10);

    const list = scroller();
    const rowWidth = () =>
      document.querySelector<HTMLElement>("[data-history-row-id] p")?.getBoundingClientRect().width;
    expect(rowWidth()).toBeLessThanOrEqual(CONTENT_MAX_WIDTH);

    // The handle let go: the width reaches the rows once, through React.
    act(() => setters?.width(WIDENED));
    await frames(10);
    expect(rowWidth()).toBeGreaterThan(CONTENT_MAX_WIDTH);
    expect(rowWidth()).toBeLessThanOrEqual(WIDENED);

    // The agent streams while the reader scrolls up into the virtualized history.
    let live: StreamItem[] = [];
    for (let step = 0; step < 30; step += 1) {
      live = live.concat(message(1000 + step));
      act(() => setters?.live(live));
      if (step === 10) scrollUpTo(list, list.scrollHeight / 2);
      if (step === 20) scrollUpTo(list, list.scrollHeight / 4);
      await frames(2);
    }
    await frames(10);
    expect(overlaps()).toEqual([]);
    // The history is virtualized, and the reader is in its middle, not following the output.
    expect(document.querySelectorAll("[data-history-row-id]").length).toBeLessThan(history.length);
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(list.scrollTop).toBeLessThan(list.scrollHeight - list.clientHeight - 100);

    // The stream stopped: neither the list's height nor the reader's place moves on its own.
    const height = list.scrollHeight;
    const top = list.scrollTop;
    await frames(30);
    expect(list.scrollHeight).toBe(height);
    expect(Math.abs(list.scrollTop - top)).toBeLessThanOrEqual(1);

    // And back to the content width while scrolled into the middle.
    act(() => setters?.width(null));
    await frames(15);
    expect(rowWidth()).toBeLessThanOrEqual(CONTENT_MAX_WIDTH);
    expect(overlaps()).toEqual([]);
    expect(errors.filter((line) => /Maximum update depth|#185/.test(line))).toEqual([]);
  });
});
