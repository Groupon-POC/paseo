/** @vitest-environment jsdom */
// Added for Groupon Desk (fork of Paseo, Apache-2.0): a revoked reader loses the transcript and writer, including a refresh already in flight.
import React, { type PropsWithChildren } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { identityFromVaultKey } from "./crypto";
import { CoreError } from "./core-client";
import { HubHistoryChatScreen } from "./history-chat-screen";
import { fetchAllMessages, fetchOverview, type HubSharedWorkspace } from "./hub";

type BoxProps = PropsWithChildren<{ testID?: string }>;
vi.mock("react-native", () => {
  const Box = ({ children, testID }: BoxProps) =>
    React.createElement("div", { "data-testid": testID }, children);
  return { View: Box, Text: Box, ScrollView: Box, ActivityIndicator: () => null };
});
vi.mock("react-native-unistyles", () => ({ StyleSheet: { create: () => ({}) } }));
vi.mock("@/components/headers/back-header", () => ({ BackHeader: () => null }));
vi.mock("@/components/ui/press-highlight", () => ({ PressHighlight: () => null }));
vi.mock("@/components/markdown/renderer", () => ({ MarkdownRenderer: () => null }));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: BoxProps) => React.createElement("button", { type: "button" }, children),
}));
vi.mock("@/components/ui/text-input", () => ({
  EditingTextInput: ({ testID }: BoxProps) =>
    React.createElement("textarea", { "data-testid": testID }),
}));
vi.mock("./message-author", () => ({
  AuthorChip: () => null,
  authorStyles: {},
  thisDevice: () => "test",
}));
vi.mock("./presence-row", () => ({
  useHubPresence: () => ({ data: null }),
  PresenceRow: () => null,
}));
vi.mock("./hub", () => ({
  fetchAllMessages: vi.fn(),
  fetchOverview: vi.fn(),
  answerPermission: vi.fn(),
  sendSharedPrompt: vi.fn(),
}));
const session = {
  sealKey: new Uint8Array(32).fill(2),
  deskIdentity: identityFromVaultKey(new Uint8Array(32).fill(2)),
  identity: { userId: "colleague" },
};
vi.mock("./session", () => ({
  useGrouponStore: (select: (state: unknown) => unknown) => select(session),
}));

// The same published key/box vector as share-model.test.ts and the CLI's share-seal test.
const grant: HubSharedWorkspace = {
  shareId: "share",
  role: "write",
  shareKeyVersion: 3,
  sealedShareKey:
    "EQpnBpjpeoN2VwTkqlHuyRyVNU9O01AbT4kD4LSwfIbBP1J1fhSxN7GEltiwMOwiwGU8WKJ/ItM0qwJM4WrXqB0AJL++jghYzY/3oTKKw2HdvID2dbfK9Q4QXh+N298L8iBbE6Yh4Vw5bFgXcBXr8O3GWUTREJEnUyutZl6dPg2HwqsVkHBgHas=",
  owner: {
    userId: "owner",
    name: "Owner",
    email: "owner@example.com",
    publicKey: "ctY2jnarD8Yu8ffmd1i0k4DyGMG4oCltpfy7qY0Eo1o=",
  },
  repositoryName: "repo",
  sharedAt: "2026-10-24T12:00:00Z",
  workspace: {
    id: "w-vector",
    machine: "mac-a",
    name: "Workspace",
    branch: "task",
    targetBranch: "staging",
    ticketKey: null,
    state: "ready",
    status: "idle",
    updatedAt: "2026-10-24T12:00:00Z",
  },
  chats: [
    {
      id: "chat",
      workspaceId: "w-vector",
      machine: "mac-a",
      agent: "claude",
      title: "Chat",
      model: "claude-haiku-4-5",
      effort: null,
      status: "idle",
      lastMessageAt: null,
      createdAt: "2026-10-24T12:00:00Z",
    },
  ],
};
async function mount() {
  vi.stubGlobal("React", React);
  vi.useFakeTimers();
  vi.mocked(fetchAllMessages).mockResolvedValue([]);
  vi.mocked(fetchOverview).mockResolvedValue({
    repositories: [],
    machines: [],
    workspaces: [],
    chats: [],
    sharedWithMe: [grant],
  });
  await act(async () => {
    render(React.createElement(HubHistoryChatScreen, { chatId: "chat" }));
  });
  expect(screen.queryByTestId("hub-history-shared-writer")).not.toBeNull();
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
describe("shared chat access refresh", () => {
  it("removes the writer and transcript when the server rejects a revoked grant", async () => {
    await mount();
    vi.mocked(fetchAllMessages).mockRejectedValueOnce(
      new CoreError("Workspace is no longer shared with you", 404),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(screen.queryByTestId("hub-history-shared-writer")).toBeNull();
    expect(screen.getByText("Workspace is no longer shared with you")).not.toBeNull();
    expect(screen.queryByTestId("hub-history-shared-composer")).toBeNull();
  });
  it("does not restore access from an older response after a later refresh was refused", async () => {
    await mount();
    let finish: ((rows: Awaited<ReturnType<typeof fetchAllMessages>>) => void) | undefined;
    vi.mocked(fetchAllMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    vi.mocked(fetchAllMessages).mockRejectedValueOnce(new CoreError("Access removed", 404));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    await act(async () => {
      finish?.([]);
    });
    expect(screen.queryByTestId("hub-history-shared-writer")).toBeNull();
    expect(screen.getByText("Access removed")).not.toBeNull();
  });
});
