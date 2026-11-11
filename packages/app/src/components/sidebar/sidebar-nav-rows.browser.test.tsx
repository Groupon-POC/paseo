// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar's header rows fold under "More", in a real browser.

/**
 * Tests for the sidebar's header rows and their "More" fold.
 *
 * Covers: packages/app/src/components/sidebar/sidebar-nav-rows.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { sidebarNewChatRow: true };
vi.mock("@/hooks/use-settings", () => ({
  useSettings: (select: (value: typeof settings) => unknown) => select(settings),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() }, usePathname: () => "/" }));
vi.mock("@/hooks/use-shortcut-keys", () => ({ useShortcutKeys: () => null }));
vi.mock("@/runtime/host-features", () => ({ useHostFeature: () => false }));
vi.mock("@/stores/navigation-active-workspace-store", () => ({
  useActiveWorkspaceSelection: () => null,
}));
vi.mock("@/stores/session-store-hooks", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useWorkspace: () => null,
}));
vi.mock("@/plugins/sidebar-items", () => ({
  PluginSidebarItem: ({ group }: { group: { id: string } }) => (
    <div data-testid={`plugin-row-${group.id}`} />
  ),
}));
vi.mock("@/groupon/new-chat-row", () => ({
  SidebarNewChatRow: () => <div data-testid="sidebar-global-new-chat">New chat</div>,
}));
vi.mock("@/sidebar-nav/use-sidebar-nav-items", () => ({
  useSidebarNavItems: () => ({
    items: [
      { kind: "builtin", key: "history", id: "history", visible: true },
      { kind: "builtin", key: "new-workspace", id: "new-workspace", visible: true },
      { kind: "builtin", key: "search", id: "search", visible: true },
      { kind: "builtin", key: "schedules", id: "schedules", visible: true },
      { kind: "plugin", key: "plugin:bots", group: { id: "bots" }, visible: true },
      { kind: "plugin", key: "plugin:hidden", group: { id: "hidden" }, visible: false },
    ],
    setVisible: () => {},
    move: () => {},
  }),
}));

await import("@/i18n/i18next");
const { SidebarNavRows } = await import("./sidebar-nav-rows");
const { useSidebarViewStore } = await import("@/stores/sidebar-view-store");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  useSidebarViewStore.setState({ headerRowsExpanded: false });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const FOLDED = ["sidebar-sessions", "sidebar-search", "sidebar-schedules", "plugin-row-bots"];

describe("the sidebar's header rows", () => {
  it("show only New chat, New workspace and More by default", () => {
    act(() => root?.render(<SidebarNavRows />));

    expect(byTestId("sidebar-global-new-chat")).not.toBeNull();
    expect(byTestId("sidebar-global-new-workspace")).not.toBeNull();
    expect(byTestId("sidebar-header-more")?.textContent).toContain("More");
    for (const id of FOLDED) expect(byTestId(id)).toBeNull();
  });

  it("unfold under More in the person's order, and fold back", () => {
    act(() => root?.render(<SidebarNavRows />));
    act(() => byTestId("sidebar-header-more")?.click());

    expect(useSidebarViewStore.getState().headerRowsExpanded).toBe(true);
    for (const id of FOLDED) expect(byTestId(id)).not.toBeNull();
    expect(byTestId("plugin-row-hidden")).toBeNull();
    const order = [...(host?.querySelectorAll("[data-testid]") ?? [])]
      .map((element) => element.getAttribute("data-testid"))
      .filter((id) => id && (FOLDED.includes(id) || id === "sidebar-header-more"));
    expect(order).toEqual(["sidebar-header-more", ...FOLDED]);

    act(() => byTestId("sidebar-header-more")?.click());
    expect(useSidebarViewStore.getState().headerRowsExpanded).toBe(false);
    for (const id of FOLDED) expect(byTestId(id)).toBeNull();
  });

  it("open unfolded when the stored choice says so", () => {
    useSidebarViewStore.setState({ headerRowsExpanded: true });
    act(() => root?.render(<SidebarNavRows />));
    for (const id of FOLDED) expect(byTestId(id)).not.toBeNull();
  });
});
