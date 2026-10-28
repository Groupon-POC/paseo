// Added for Groupon Desk (fork of Paseo, Apache-2.0): "New chat" in the sidebar follows its switch in Settings > Sidebar, in a real browser.

/**
 * Tests for the "New chat" sidebar row and its setting.
 *
 * Covers: packages/app/src/groupon/new-chat-sidebar-setting.tsx, packages/app/src/components/sidebar/sidebar-nav-rows.tsx
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const settings = { sidebarNewChatRow: true };
const updateSettings = vi.fn(async () => {});
vi.mock("@/hooks/use-settings", () => ({
  useAppSettings: () => ({ settings, updateSettings }),
  useSettings: (select: (value: typeof settings) => unknown) => select(settings),
}));
vi.mock("@/components/toast-host", () => ({
  useToastHost: () => ({ api: null, toast: null, dismiss: () => {} }),
  ToastViewport: () => null,
}));
vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ show: () => () => {}, copied: () => {}, error: vi.fn() }),
  ToastApiProvider: ({ children }: { children: React.ReactNode }) => children,
}));
// The switch animates with the theme's colours, which the browser project's stub does not hand it.
vi.mock("@/components/ui/switch", () => ({
  Switch: function StubSwitch(props: {
    value: boolean;
    onValueChange: (next: boolean) => void;
    testID?: string;
  }) {
    const { value, onValueChange } = props;
    const toggle = React.useCallback(() => onValueChange(!value), [onValueChange, value]);
    return (
      <button type="button" data-testid={props.testID} aria-checked={value} onClick={toggle} />
    );
  },
}));
// The other rows and their stores are not under test.
vi.mock("@/plugins/sidebar-items", () => ({ PluginSidebarItem: () => null }));
vi.mock("@/hooks/use-shortcut-keys", () => ({ useShortcutKeys: () => null }));
vi.mock("@/sidebar-nav/use-sidebar-nav-items", () => ({
  useSidebarNavItems: () => ({ items: [], setVisible: () => {}, move: () => {} }),
}));
vi.mock("@/groupon/new-chat-row", () => ({
  SidebarNewChatRow: () => <div data-testid="sidebar-global-new-chat">New chat</div>,
}));

const { NewChatSidebarSetting } = await import("./new-chat-sidebar-setting");
const { SidebarNavRows } = await import("@/components/sidebar/sidebar-nav-rows");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("React", React);
  updateSettings.mockClear();
  settings.sidebarNewChatRow = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

const CLOSE = <span data-testid="close" />;

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe("New chat in the sidebar", () => {
  it("leads the sidebar until the person hides it, and the trailing control keeps its line", () => {
    act(() => root?.render(<SidebarNavRows firstRowTrailing={CLOSE} />));
    expect(byTestId("sidebar-global-new-chat")).not.toBeNull();

    settings.sidebarNewChatRow = false;
    act(() => root?.render(<SidebarNavRows firstRowTrailing={CLOSE} />));
    expect(byTestId("sidebar-global-new-chat")).toBeNull();
    expect(byTestId("close")).not.toBeNull();
  });

  it("is hidden from its switch in Settings > Sidebar", () => {
    act(() => root?.render(<NewChatSidebarSetting />));
    const toggle = byTestId("sidebar-nav-toggle-new-chat");
    expect(toggle).not.toBeNull();

    act(() => toggle?.click());

    expect(updateSettings).toHaveBeenCalledWith({ sidebarNewChatRow: false });
  });
});
