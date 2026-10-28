// Changed for Groupon Desk (fork of Paseo, Apache-2.0): its cases compare the checkout's own changes ("all").
// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { seedSessionWorkspaces } from "@/test/seed-session";
import { selectWorkingDiffComparison } from "@/git/working-diff-comparison";
import { useWorkspaceHasDiffStat } from "./workspace-diff-stat";

const SERVER_ID = "diff-stat-pill";
const WORKSPACE_ID = "workspace";

const workspace: WorkspaceDescriptor = {
  createdAt: null,
  lastUserMessageAt: null,
  id: WORKSPACE_ID,
  projectId: "project",
  projectDisplayName: "Project",
  projectRootPath: "/repo",
  workspaceDirectory: "/repo",
  projectKind: "git",
  workspaceKind: "local_checkout",
  name: "main",
  status: "done",
  statusEnteredAt: null,
  archivingAt: null,
  diffStat: null,
  scripts: [],
};

function setDiffStat(diffStat: WorkspaceDescriptor["diffStat"]): void {
  useSessionStore.getState().setWorkspaces(SERVER_ID, (workspaces) => {
    const next = new Map(workspaces);
    next.set(WORKSPACE_ID, { ...workspace, diffStat });
    return next;
  });
}

// Groupon Desk: the hook reads the session's changes through react-query.
const queryClient = new QueryClient();
function withQueryClient({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useWorkspaceHasDiffStat", () => {
  beforeEach(() => {
    useSessionStore.getState().initializeSession(SERVER_ID, null as unknown as DaemonClient);
    seedSessionWorkspaces(SERVER_ID, new Map([[WORKSPACE_ID, workspace]]));
  });

  afterEach(() => {
    useSessionStore.getState().clearSession(SERVER_ID);
  });

  // Groupon Desk: these cases count the checkout's own changes, so the Changes compare "all".
  beforeEach(() => {
    selectWorkingDiffComparison({
      serverId: SERVER_ID,
      workspaceId: WORKSPACE_ID,
      cwd: "",
      comparison: "all",
    });
  });

  it("does not re-render its owner when only the visible counts change", () => {
    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount += 1;
        return useWorkspaceHasDiffStat(SERVER_ID, WORKSPACE_ID);
      },
      { wrapper: withQueryClient },
    );

    expect(result.current).toBe(false);
    expect(renderCount).toBe(1);

    act(() => setDiffStat({ additions: 2, deletions: 0 }));
    expect(result.current).toBe(true);
    expect(renderCount).toBe(2);

    act(() => setDiffStat({ additions: 5, deletions: 3 }));
    expect(result.current).toBe(true);
    expect(renderCount).toBe(2);

    act(() => setDiffStat(null));
    expect(result.current).toBe(false);
    expect(renderCount).toBe(3);
  });
});
