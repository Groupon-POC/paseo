// Added for Groupon Desk (fork of Paseo, Apache-2.0): the setup notice reaches an agent made the way the hub and the door make one, through a real daemon and client.

/**
 * Ledger WW-105: the hand makes a hub or door agent with `agent.create.request` and no initial
 * prompt, then sends the prompt as `send_agent_message_request` with the hub command's id as the
 * message id and `activeTurnBehavior: "steer"` (`packages/groupon-cli/src/hand/paseo/agents.ts` in
 * groupon2/engineering-development). This drives that sequence against a daemon and checks what the
 * provider receives.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { AgentPromptInput } from "../server/agent/agent-sdk-types.js";
import { getFullAccessConfig } from "../server/daemon-e2e/agent-configs.js";
import { createDaemonTestContext, type DaemonTestContext } from "../server/test-utils/index.js";
import { createTestAgentClients } from "../server/test-utils/fake-agent-client.js";
import { SETUP_STATE_FILE } from "./worktree-setup-state.js";

let ctx: DaemonTestContext;
const prompts: AgentPromptInput[] = [];

beforeAll(async () => {
  ctx = await createDaemonTestContext({
    agentClients: createTestAgentClients({ onStartTurn: (prompt) => prompts.push(prompt) }),
  });
}, 60000);

afterAll(async () => {
  await ctx.cleanup();
}, 60000);

/** A worktree as `git worktree add` leaves it, its setup running as the hand records it. */
function runningWorktree(): string {
  const root = mkdtempSync(join(tmpdir(), "desk-hub-notice-"));
  writeFileSync(join(root, ".git"), "gitdir: /elsewhere\n");
  mkdirSync(join(root, ".groupon"), { recursive: true });
  writeFileSync(
    join(root, SETUP_STATE_FILE),
    JSON.stringify({
      state: "running",
      step: "1/2 pnpm install --frozen-lockfile",
      steps: ["pnpm install --frozen-lockfile", "pnpm checkout:prepare"],
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    }),
  );
  return root;
}

function texts(prompt: AgentPromptInput | undefined): string[] {
  if (prompt === undefined) return [];
  if (typeof prompt === "string") return [prompt];
  return prompt.flatMap((block) => (block.type === "text" ? [block.text] : []));
}

test("a hub agent's first prompt carries the setup notice before the person's words, its second does not", async () => {
  const cwd = runningWorktree();
  try {
    const agent = await ctx.client.createAgent({
      ...getFullAccessConfig("claude"),
      cwd,
      title: "W117 hub path",
      idempotencyKey: "hub-command-open-1",
    });

    await ctx.client.sendAgentMessage(agent.id, "pnpm -s guards", {
      messageId: "hub-command-1",
      activeTurnBehavior: "steer",
    });
    await ctx.client.waitForFinish(agent.id, 60000);
    await ctx.client.sendAgentMessage(agent.id, "and again", {
      messageId: "hub-command-2",
      activeTurnBehavior: "steer",
    });
    await ctx.client.waitForFinish(agent.id, 60000);

    expect(prompts).toHaveLength(2);
    const [first, second] = prompts;
    expect(texts(first)).toEqual([
      expect.stringContaining("The worktree's setup is still running"),
      "pnpm -s guards",
    ]);
    expect(texts(second)).toEqual(["and again"]);

    await ctx.client.deleteAgent(agent.id);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}, 120000);
