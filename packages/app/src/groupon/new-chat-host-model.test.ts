// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for the Mac a chat with no project starts on.

/**
 * Covers: groupon/new-chat-host-model.ts
 */

import { describe, expect, it } from "vitest";
import type { HostRuntimeConnectionStatus } from "@/runtime/host-runtime";
import { newChatServerId } from "./new-chat-host-model";

const statuses = (entries: Record<string, HostRuntimeConnectionStatus>) =>
  new Map(Object.entries(entries));

describe("newChatServerId", () => {
  it("takes the Mac in use when it is online", () => {
    expect(newChatServerId("b", ["a", "b"], statuses({ a: "online", b: "online" }))).toBe("b");
  });

  it("skips the Mac in use when it is offline and another is online", () => {
    expect(
      newChatServerId("remote", ["remote", "mac"], statuses({ remote: "offline", mac: "online" })),
    ).toBe("mac");
  });

  it("skips an offline first Mac when no Mac is in use", () => {
    expect(
      newChatServerId(null, ["remote", "mac"], statuses({ remote: "error", mac: "online" })),
    ).toBe("mac");
  });

  it("keeps the Mac in use when none is online", () => {
    expect(newChatServerId("b", ["a", "b"], statuses({ a: "connecting", b: "offline" }))).toBe("b");
  });

  it("is empty when there is no Mac", () => {
    expect(newChatServerId(null, [], statuses({}))).toBe("");
  });
});
