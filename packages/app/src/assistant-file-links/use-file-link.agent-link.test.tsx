// Added for Groupon Desk (fork of Paseo, Apache-2.0): an agent's link in a chat opens that agent's chat in this window.
/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { openExternalUrl } from "@/utils/open-external-url";
import { AssistantFileLinkResolverProvider } from "./provider";
import { useFileLink } from "./use-file-link";

vi.mock("@/utils/open-external-url", () => ({
  openExternalUrl: vi.fn(async () => {}),
}));

vi.mock("@/utils/navigate-to-agent", () => ({
  navigateToAgent: vi.fn(() => "/"),
}));

const NO_SUGGESTIONS = { getDirectorySuggestions: async () => ({ entries: [], error: null }) };
const NO_FILE_OPENS = () => {};

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AssistantFileLinkResolverProvider
        client={NO_SUGGESTIONS}
        serverId="server-1"
        workspaceRoot="/Users/test/project"
        onOpenWorkspaceFile={NO_FILE_OPENS}
      >
        {children}
      </AssistantFileLinkResolverProvider>
    </QueryClientProvider>
  );
}

describe("a link in a chat", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("opens the agent a groupon-desk link names in this window, never the browser", async () => {
    const { result } = renderHook(
      () =>
        useFileLink({
          href: "groupon-desk://h/srv_mini/agent/7f3c-new-session",
          text: "the new session",
        }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.onPress();
    });

    await waitFor(() => {
      expect(navigateToAgent).toHaveBeenCalledWith({
        serverId: "srv_mini",
        agentId: "7f3c-new-session",
      });
    });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("still opens a web address in the browser", async () => {
    const { result } = renderHook(
      () =>
        useFileLink({
          href: "https://github.com/groupon/groupon-monorepo/pull/9601",
          text: "PR 9601",
        }),
      { wrapper: Wrapper },
    );

    act(() => {
      result.current.onPress();
    });

    await waitFor(() => {
      expect(openExternalUrl).toHaveBeenCalledWith(
        "https://github.com/groupon/groupon-monorepo/pull/9601",
      );
    });
    expect(navigateToAgent).not.toHaveBeenCalled();
  });
});
