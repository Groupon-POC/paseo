// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Switch on a Groupon subscription card in the Usage modal.
/**
 * Tests the Usage modal's Groupon subscription cards in a real browser: "In use" on the Mac's
 * default sign-in, Switch on the others, every Switch held while one switches, and the usage read
 * again once Groupon Desk answers.
 *
 * Covers: packages/app/src/groupon/usage-subscription-switch.tsx
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { page } from "@vitest/browser/context";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "@/i18n/i18next";
import type { UsageDisplay } from "@/usage/display";
import { UsageList } from "@/usage/list";
import type { UsageReportEntry } from "@/usage/types";
import type { MacSubscriptionAnswer } from "./desk-plugin-rpc";
import { UsageSubscriptionSwitch } from "./usage-subscription-switch";

// The daemon connection and the usage queries are the boundary: the app's real modules for them
// pull in the native router, which the browser project cannot bundle.
const rpc = vi.hoisted(() => ({
  calls: [] as { method: string; input: unknown }[],
  release: null as null | (() => void),
}));
const refreshUsage = vi.hoisted(() => vi.fn());

const SUBSCRIPTIONS: MacSubscriptionAnswer = {
  machine: "Tomas - Mac Mini in Office Prague",
  unregisteredEmail: null,
  subscriptions: [
    {
      email: "zaruba@skunks.cz",
      name: "zaruba",
      plan: "Max 20x",
      providerId: "claude-58de8b7a",
      active: true,
      sessionPct: 12,
      weeklyPct: 40,
      modelWindows: [],
    },
    {
      email: "info3@skunks.cz",
      name: "info3",
      plan: "Max 20x",
      providerId: "claude-0c1d2e3f",
      active: false,
      sessionPct: 3,
      weeklyPct: 61,
      modelWindows: [],
    },
    {
      email: "info4@skunks.cz",
      name: "info4",
      plan: "Max 20x",
      providerId: "claude-9a8b7c6d",
      active: false,
      sessionPct: 0,
      weeklyPct: 18,
      modelWindows: [],
    },
  ],
  rotation: { autoRotate: false, effective: false },
  lastSwitch: null,
};

vi.mock("@/runtime/host-runtime", () => ({
  useHostRuntimeClient: () => ({
    invokePluginRpc: async (_plugin: string, method: string, input: unknown) => {
      rpc.calls.push({ method, input });
      if (method === "groupon.mac-subscription") return SUBSCRIPTIONS;
      await new Promise<void>((resolve) => {
        rpc.release = resolve;
      });
      return { state: "done", message: null };
    },
  }),
}));
vi.mock("@/usage/in-sidebar", () => ({ useUsageInSidebar: () => ({ inSidebar: false }) }));
vi.mock("@/usage/queries", () => ({
  useReportRefresh: () => ({ refresh: () => {}, refreshState: "idle" }),
  useRefreshUsageReports: () => refreshUsage,
}));

const display: UsageDisplay = {
  displayAs: "used",
  setDisplayAs: () => {},
  isPinned: () => false,
  togglePin: () => {},
};

function card(email: string, providerId: string, weekly: number): UsageReportEntry {
  return {
    id: `groupon-subscriptions:${providerId}`,
    account: { label: `Claude · ${email} (Max)` },
    fetchedAt: new Date().toISOString(),
    sourceId: "groupon-subscriptions",
    sourceLabel: "Groupon subscriptions",
    report: {
      status: "available",
      planLabel: "Max 20x",
      windows: [{ id: "weekly", label: "Weekly", usedPct: weekly }],
      details: [
        { id: "reading", label: "Reading", value: "2 min old, read on this Mac" },
        { id: "provider", label: "Provider", value: providerId },
      ],
    },
  };
}

const CARDS = [
  card("zaruba@skunks.cz", "claude-58de8b7a", 40),
  card("info3@skunks.cz", "claude-0c1d2e3f", 61),
  card("info4@skunks.cz", "claude-9a8b7c6d", 18),
];

const renderCardAction = (entry: UsageReportEntry) => (
  <UsageSubscriptionSwitch serverId="mini" entry={entry} />
);

let root: Root;
let container: HTMLDivElement;

beforeEach(async () => {
  vi.stubGlobal("React", React);
  // The Usage modal is 640 px wide on a desktop window.
  await page.viewport(900, 1000);
  await i18n.changeLanguage("en");
  rpc.calls.length = 0;
  rpc.release = null;
  refreshUsage.mockClear();
  container = document.createElement("div");
  container.style.width = "560px";
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render() {
  const queryClient = new QueryClient();
  act(() =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <UsageList
          serverId="mini"
          reports={CARDS}
          display={display}
          renderCardAction={renderCardAction}
        />
      </QueryClientProvider>,
    ),
  );
}

const rows = () => [...container.querySelectorAll('[data-testid="usage-subscription-switch"]')];
const buttons = () =>
  [
    ...container.querySelectorAll('[data-testid="usage-subscription-switch-button"]'),
  ] as HTMLElement[];

it("says In use on the Mac's sign-in and offers Switch on the others", async () => {
  render();
  await expect.poll(() => rows().length).toBe(3);
  expect(rows()[0]?.textContent).toContain("In use");
  expect(rows()[0]?.textContent).toContain("Tomas - Mac Mini in Office Prague");
  expect(buttons()).toHaveLength(2);
  await page.screenshot({ element: container });
});

it("holds every Switch while one switches, then reads the usage again", async () => {
  render();
  await expect.poll(() => buttons().length).toBe(2);
  act(() => buttons()[0]?.click());
  await expect.poll(() => rows()[1]?.textContent).toContain("Switching");
  await expect.poll(() => buttons()[0]?.getAttribute("aria-disabled")).toBe("true");
  expect(rpc.calls).toContainEqual({
    method: "groupon.mac-subscription-switch",
    input: { email: "info3@skunks.cz" },
  });
  await page.screenshot({ element: container });
  await act(async () => rpc.release?.());
  await expect.poll(() => refreshUsage.mock.calls.length).toBe(1);
});
