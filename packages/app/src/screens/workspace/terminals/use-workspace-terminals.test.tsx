/** @vitest-environment jsdom */
// Added for Groupon Desk (fork of Paseo, Apache-2.0): terminal actions recover from an offline computer and from failed spawns.
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import React, { type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceTerminals } from "./use-workspace-terminals";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/data/query", () => ({ useReplicaQuery: () => ({ data: undefined, dataUpdatedAt: 0 }) }));
vi.mock("@/data/push-router", () => ({ workspaceTerminalsPushRoute: () => ({}) }));

function setup(overrides: { isConnected?: boolean; workspaceDirectory?: string | null } = {}) {
  const create = vi
    .fn()
    .mockResolvedValue({ terminal: { id: "terminal-1", name: "Shell", cwd: "/different/path" } });
  const input = {
    client: { createTerminal: create } as unknown as DaemonClient,
    isConnected: true,
    isRouteFocused: true,
    normalizedServerId: "mac-b",
    normalizedWorkspaceId: "workspace-b",
    workspaceDirectory: "/different/path",
    workspaceScripts: [],
    hasHydratedWorkspaces: true,
    isMissingWorkspaceDirectory: false,
    onTerminalCreated: vi.fn(),
    onScriptTerminalSelected: vi.fn(),
    onWorkspacePathUnavailable: vi.fn(),
    onTerminalCreateQueued: vi.fn(),
    onTerminalCreateFailed: vi.fn(),
    ...overrides,
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    ...renderHook((props) => useWorkspaceTerminals(props), { initialProps: input, wrapper }),
    input,
    create,
  };
}
const launch = { destination: { kind: "replace" as const, tabId: "new-tab" } };
afterEach(() => vi.useRealTimers());

describe("workspace terminal action", () => {
  it("explains an offline computer without leaving the action queued, then opens on that computer after reconnect", async () => {
    const { result, rerender, input, create } = setup({ isConnected: false });
    act(() => result.current.createTerminal(launch));
    expect(result.current.createError).toContain("not connected");
    expect(result.current.pendingCreateInput).toBeNull();
    expect(create).not.toHaveBeenCalled();
    rerender({ ...input, isConnected: true });
    act(() => result.current.createTerminal(launch));
    await waitFor(() =>
      expect(input.onTerminalCreated).toHaveBeenCalledWith({
        terminalId: "terminal-1",
        destination: launch.destination,
      }),
    );
    expect(create).toHaveBeenCalledWith("/different/path", undefined, undefined, {
      workspaceId: "workspace-b",
    });
    expect(result.current.createError).toBeNull();
  });

  it("keeps a spawn failure visible and allows another attempt", async () => {
    const { result, create } = setup();
    create.mockResolvedValueOnce({ terminal: null, error: "Shell was not found" });
    act(() => result.current.createTerminal(launch));
    await waitFor(() => expect(result.current.createError).toBe("Shell was not found"));
    expect(result.current.createMutation.isPending).toBe(false);
    act(() => result.current.createTerminal(launch));
    await waitFor(() => expect(result.current.createMutation.isSuccess).toBe(true));
    expect(result.current.createError).toBeNull();
  });

  it("stops waiting for an unresolved workspace instead of disabling Terminal forever", () => {
    vi.useFakeTimers();
    const { result, create } = setup({ workspaceDirectory: null });
    act(() => result.current.createTerminal(launch));
    expect(result.current.pendingCreateInput).toEqual(launch);
    act(() => vi.advanceTimersByTime(15_000));
    expect(result.current.pendingCreateInput).toBeNull();
    expect(result.current.createError).toContain("workspace is not ready");
    expect(create).not.toHaveBeenCalled();
  });

  it("does not carry a queued terminal to a different computer or workspace", () => {
    const { result, rerender, input, create } = setup({ workspaceDirectory: null });
    act(() => result.current.createTerminal(launch));
    rerender({
      ...input,
      normalizedServerId: "mac-c",
      normalizedWorkspaceId: "workspace-c",
      workspaceDirectory: "/new-machine/path",
    });
    expect(result.current.pendingCreateInput).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
