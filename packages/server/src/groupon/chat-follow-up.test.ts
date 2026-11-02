// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for a chat's follow-up message after its turn.

import { describe, expect, it, vi } from "vitest";
import { chatFollowUpRequestOf, scheduleChatFollowUp } from "./chat-follow-up.js";

describe("chatFollowUpRequestOf", () => {
  it("takes an agent and a text, nothing empty or too long", () => {
    expect(chatFollowUpRequestOf({ agentId: "a1", text: "go on" })).toEqual({
      agentId: "a1",
      text: "go on",
    });
    expect(() => chatFollowUpRequestOf({ agentId: "", text: "x" })).toThrow(/agentId/);
    expect(() => chatFollowUpRequestOf({ agentId: "a1", text: " " })).toThrow(/text/);
    expect(() => chatFollowUpRequestOf({ agentId: "a1", text: "x".repeat(20_001) })).toThrow(
      /longer/,
    );
  });
});

describe("scheduleChatFollowUp", () => {
  it("sends once the turn ends, and keeps a second ask from doubling it", async () => {
    let endTurn = () => {};
    const turnEnded = new Promise<void>((resolve) => {
      endTurn = resolve;
    });
    const send = vi.fn(async () => {});
    const deps = { waitForTurnEnd: () => turnEnded, send, onFailure: vi.fn() };

    expect(scheduleChatFollowUp({ agentId: "a1", text: "go on" }, deps)).toEqual({
      continueWith: true,
    });
    expect(scheduleChatFollowUp({ agentId: "a1", text: "again" }, deps)).toEqual({
      continueWith: false,
    });
    expect(send).not.toHaveBeenCalled();

    endTurn();
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith("a1", "go on"));
    expect(send).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(scheduleChatFollowUp({ agentId: "a1", text: "later" }, deps)).toEqual({
        continueWith: true,
      }),
    );
  });
});
