// Added for Groupon Desk (fork of Paseo, Apache-2.0): a user message's author on the wire, and a peer without one.
import { describe, expect, it } from "vitest";
import {
  AgentStreamEventPayloadSchema,
  SendAgentMessageRequestSchema,
  SendAgentMessageSchema,
  UserMessageAuthorSchema,
} from "./messages";

const author = { userId: "u-carl", name: "Carl Colleague", device: "Mac app" };

describe("user message author", () => {
  it("keeps the author a sender names on send_agent_message_request", () => {
    const parsed = SendAgentMessageRequestSchema.parse({
      type: "send_agent_message_request",
      requestId: "request-1",
      agentId: "agent-1",
      text: "check the rounding",
      messageId: "command-1",
      author,
    });
    expect(parsed.author).toEqual(author);
  });

  it("still takes a request with no author, as every sender before authors sent it", () => {
    const parsed = SendAgentMessageRequestSchema.parse({
      type: "send_agent_message_request",
      requestId: "request-2",
      agentId: "agent-1",
      text: "old client",
    });
    expect(parsed.author).toBeUndefined();
  });

  it("takes the author on the older send_agent_message too", () => {
    expect(
      SendAgentMessageSchema.parse({ type: "send_agent_message", agentId: "a", text: "t", author })
        .author,
    ).toEqual(author);
  });

  it("refuses an author without a user id, and takes one without a device", () => {
    expect(UserMessageAuthorSchema.safeParse({ userId: "", name: "Nobody" }).success).toBe(false);
    expect(UserMessageAuthorSchema.parse({ userId: "u-1", name: "Olga" })).toEqual({
      userId: "u-1",
      name: "Olga",
    });
  });

  it("keeps the author on the timeline's user_message, and leaves a message without one as it was", () => {
    const withAuthor = AgentStreamEventPayloadSchema.parse({
      type: "timeline",
      provider: "claude",
      item: { type: "user_message", text: "hi", clientMessageId: "c-1", author },
    });
    expect(withAuthor.type === "timeline" && withAuthor.item).toEqual({
      type: "user_message",
      text: "hi",
      clientMessageId: "c-1",
      author,
    });
    const without = AgentStreamEventPayloadSchema.parse({
      type: "timeline",
      provider: "claude",
      item: { type: "user_message", text: "hi" },
    });
    expect(without.type === "timeline" && without.item).toEqual({
      type: "user_message",
      text: "hi",
    });
  });

  it("passes the generated outbound validator with the author intact", async () => {
    const { validateWSOutboundMessage } = await import("./validation/ws-outbound.js");
    const message = {
      type: "agent_stream",
      payload: {
        agentId: "agent-1",
        event: {
          type: "timeline",
          provider: "claude",
          item: { type: "user_message", text: "hi", clientMessageId: "c-1", author },
        },
        timestamp: "2026-10-21T10:00:00.000Z",
        seq: 3,
      },
    };
    const result = validateWSOutboundMessage({ type: "session", message });
    expect(result.success).toBe(true);
    if (!result.success || result.data.type !== "session") return;
    const sent = result.data.message;
    expect(
      sent.type === "agent_stream" &&
        sent.payload.event.type === "timeline" &&
        sent.payload.event.item.type === "user_message"
        ? sent.payload.event.item.author
        : null,
    ).toEqual(author);
  });
});
