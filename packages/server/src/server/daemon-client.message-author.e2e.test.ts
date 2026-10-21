// Added for Groupon Desk (fork of Paseo, Apache-2.0): a prompt's author rides from DaemonClient.sendAgentMessage onto the timeline's user_message.
import { afterAll, beforeAll, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDaemonTestContext, type DaemonTestContext } from "./test-utils/index.js";
import { getFullAccessConfig } from "./daemon-e2e/agent-configs.js";

let ctx: DaemonTestContext;

beforeAll(async () => {
  ctx = await createDaemonTestContext();
}, 60000);

afterAll(async () => {
  await ctx.cleanup();
}, 60000);

async function userMessages(agentId: string) {
  const timeline = await ctx.client.fetchAgentTimeline(agentId, {
    direction: "tail",
    limit: 0,
    projection: "canonical",
  });
  return timeline.entries.flatMap((entry) =>
    entry.item.type === "user_message" ? [entry.item] : [],
  );
}

test("a prompt sent with an author is recorded with it; one without stays without", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "daemon-client-author-"));
  try {
    const agent = await ctx.client.createAgent({ ...getFullAccessConfig("codex"), cwd });
    const author = { userId: "u-carl", name: "Carl Colleague", device: "Mac app" };

    await ctx.client.sendAgentMessage(agent.id, "first, from a colleague", {
      messageId: "command-1",
      author,
    });
    await ctx.client.waitForFinish(agent.id, 60000);
    await ctx.client.sendAgentMessage(agent.id, "second, from the owner", {
      messageId: "command-2",
    });
    await ctx.client.waitForFinish(agent.id, 60000);

    const messages = await userMessages(agent.id);
    expect(messages.find((item) => item.text === "first, from a colleague")?.author).toEqual(
      author,
    );
    const owners = messages.find((item) => item.text === "second, from the owner");
    expect(owners).toBeDefined();
    expect(owners?.author).toBeUndefined();

    await ctx.client.deleteAgent(agent.id);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 120000);
