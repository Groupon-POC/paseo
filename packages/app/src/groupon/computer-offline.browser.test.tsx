// Added for Groupon Desk (fork of Paseo, Apache-2.0): "offline" on Connected computers and on a workspace's computer.
/**
 * Tests that an offline Mac says "offline" in the sidebar, rendered in a real browser: on its
 * Connected computers row and beside the computer a workspace runs on, where the word stays whole
 * while a long computer name gives way (owner, 2026-10-26).
 *
 * Covers: packages/app/src/groupon/computer-presence.ts
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { page } from "@vitest/browser/context";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMetaRow } from "@/components/sidebar/workspace-meta-row";
import type { HostBadgeModel } from "@/hosts/appearance";
import { MIN_SIDEBAR_WIDTH } from "@/stores/panel-store";
import { ConnectedComputersSidebarSection } from "./connected-computers";
import type { HubMachine } from "./hub";
import { type HubMachineView, useHubMachinesStore } from "./hub-sync";

// The hub list, the window's daemon connections, the sign-in and the sidebar settings are the
// boundary: the app's real modules for them pull in the native router, which the browser project
// cannot bundle. Each is a small store here; the sidebar's components and the offline rule run as
// they are.
vi.mock("@/runtime/host-runtime", () => ({ useHostRuntimeIsConnected: () => false }));
vi.mock("./hub-sync", async () => {
  const { create } = await import("zustand");
  return {
    useHubMachinesStore: create<{ machines: HubMachineView[] }>(() => ({ machines: [] })),
    useOnlineServerIds: () => "",
  };
});
vi.mock("./session", async () => {
  const { create } = await import("zustand");
  return { useGrouponStore: create(() => ({ status: "ready" })) };
});
vi.mock("./hub", () => ({ fetchMachines: async () => ({ machines: [] }) }));
// The person's sidebar settings live behind the same router; the host item shows whatever they say.
vi.mock("@/components/sidebar/display-preferences/model", async () => {
  const { DEFAULT_SIDEBAR_ROW_ITEMS } =
    await import("@/components/sidebar/display-preferences/row-items");
  const { DEFAULT_SIDEBAR_CHECKS_DISPLAY } =
    await import("@/components/sidebar/display-preferences/checks-display");
  return {
    useSidebarMetaPreferences: () => ({
      rowItems: DEFAULT_SIDEBAR_ROW_ITEMS,
      checksDisplay: DEFAULT_SIDEBAR_CHECKS_DISPLAY,
    }),
  };
});

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
  useHubMachinesStore.setState({ machines: [] });
});

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

function view(
  machine: Partial<HubMachine> & Pick<HubMachine, "machine" | "name">,
  serverId: string,
  thisMac = false,
): HubMachineView {
  const full: HubMachine = {
    model: null,
    alias: null,
    isPrimary: false,
    lastSeenAt: ago(5),
    relaySessionId: null,
    relayConnectedAt: null,
    relayOfferSealed: null,
    load: null,
    ...machine,
  };
  return {
    machine: full,
    label: full.name,
    state: "noOffer",
    serverId,
    direct: null,
    thisMac,
    relay: null,
    error: null,
  };
}

const studio = view(
  {
    machine: "studio",
    name: "Tomas - Mac Studio (Home)",
    load: { cpuPercent: 20, memoryPercent: 50, sampledAt: ago(5) },
  },
  "srv-studio",
  true,
);
const mini = view(
  {
    machine: "mini",
    name: "Tomas - Mac Mini in Office Prague",
    lastSeenAt: ago(13 * 3600),
    load: { cpuPercent: 5, memoryPercent: 30, sampledAt: ago(13 * 3600) },
  },
  "srv-mini",
);

const miniBadge: HostBadgeModel = {
  serverId: "srv-mini",
  label: mini.label,
  color: "none",
  showLabel: true,
};
const studioBadge: HostBadgeModel = {
  serverId: "srv-studio",
  label: studio.label,
  color: "none",
  showLabel: true,
};

function mount(width: number, node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  container.style.width = `${width}px`;
  container.style.boxSizing = "border-box";
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(node));
  mounted.push({ root, container });
  return container;
}

function byTestId(container: HTMLElement, id: string): HTMLElement | null {
  const found = container.querySelector(`[data-testid="${id}"]`);
  return found instanceof HTMLElement ? found : null;
}

describe("an offline Mac in the sidebar", () => {
  it("says offline after its name on Connected computers, and nothing after an online one", async () => {
    act(() => useHubMachinesStore.setState({ machines: [studio, mini] }));

    const container = mount(MIN_SIDEBAR_WIDTH, <ConnectedComputersSidebarSection />);

    expect(byTestId(container, "sidebar-computer-offline-mini")?.textContent).toBe("offline");
    expect(byTestId(container, "sidebar-computer-offline-studio")).toBeNull();
    await page.screenshot({ element: container });
  });

  it("says offline beside the computer a workspace runs on, whole even when the name is cut", async () => {
    act(() => useHubMachinesStore.setState({ machines: [studio, mini] }));

    const container = mount(
      MIN_SIDEBAR_WIDTH,
      <WorkspaceMetaRow
        currentBranch={null}
        projectName={null}
        hostBadge={miniBadge}
        prHint={null}
        serviceSummary={null}
      />,
    );

    const offline = byTestId(container, "host-offline-srv-mini");
    expect(offline?.textContent).toBe("offline");
    const box = offline?.getBoundingClientRect();
    expect(box?.right ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(
      container.getBoundingClientRect().right,
    );
    expect(offline?.scrollWidth).toBeLessThanOrEqual(offline?.clientWidth ?? 0);
    await page.screenshot({ element: container });
  });

  it("says nothing beside the computer of a workspace whose Mac is online", () => {
    act(() => useHubMachinesStore.setState({ machines: [studio, mini] }));

    const container = mount(
      MIN_SIDEBAR_WIDTH,
      <WorkspaceMetaRow
        currentBranch={null}
        projectName={null}
        hostBadge={studioBadge}
        prHint={null}
        serviceSummary={null}
      />,
    );

    expect(byTestId(container, "host-offline-srv-studio")).toBeNull();
  });
});
