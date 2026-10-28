// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Monitor pill's panel in a real browser: each watch, its time left, and its stop button.

/**
 * Tests for the Monitor pill and its panel.
 *
 * Covers: packages/app/src/groupon/agent-monitors.tsx
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentMonitor } from "./agent-monitors-model";

const invokePluginRpc = vi.fn(async () => ({ stopped: true }));
vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({ invokePluginRpc }),
  useHostRuntimeIsConnected: () => true,
}));
vi.mock("@/components/toast-host", () => ({
  useToastHost: () => ({ api: null, toast: null, dismiss: () => {} }),
  ToastViewport: () => null,
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: () => () => {}, copied: () => {}, error: vi.fn() }),
}));

const { AgentMonitorsPill } = await import("./agent-monitors");

const in20Minutes = new Date(Date.now() + 20 * 60_000 - 1000).toISOString();
const MONITORS: AgentMonitor[] = [
  {
    taskId: "b1",
    description: "desk build: failures and finish only",
    command: 'tail -n 0 -F /tmp/desk-build.log | grep --line-buffered "BUILD FAILED"',
    startedAt: new Date().toISOString(),
    expiresAt: in20Minutes,
  },
  {
    taskId: "b2",
    description: "deploy events",
    command: "node watch-deploy.js",
    startedAt: new Date().toISOString(),
    expiresAt: null,
  },
];

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  invokePluginRpc.mockClear();
  host = document.createElement("div");
  host.style.cssText = "position:fixed;left:40px;bottom:40px;width:600px;";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe("the Monitor pill", () => {
  it("opens a panel of the watches with their time left, and stops one", async () => {
    act(() =>
      root?.render(
        <QueryClientProvider client={new QueryClient()}>
          <AgentMonitorsPill serverId="s" agentId="agent-1" monitors={MONITORS} />
        </QueryClientProvider>,
      ),
    );
    const pill = document.querySelector<HTMLElement>('[data-testid="groupon-agent-monitors"]')!;
    expect(pill.textContent).toContain("2 monitors");

    act(() => pill.click());
    const panel = document.querySelector<HTMLElement>(
      '[data-testid="groupon-agent-monitors-panel"]',
    );
    expect(panel?.textContent).toContain("desk build: failures and finish only");
    expect(panel?.textContent).toContain("tail -n 0 -F /tmp/desk-build.log");
    expect(panel?.textContent).toContain("20 min left");
    expect(panel?.textContent).toContain("until stopped");

    const stop = document.querySelector<HTMLElement>(
      '[data-testid="groupon-agent-monitor-stop-b1"]',
    )!;
    await act(async () => {
      stop.click();
      await Promise.resolve();
    });
    expect(invokePluginRpc).toHaveBeenCalledWith(
      "groupon-desk",
      "groupon-desk.agent.monitor.stop",
      {
        agentId: "agent-1",
        taskId: "b1",
      },
    );
  });
});
