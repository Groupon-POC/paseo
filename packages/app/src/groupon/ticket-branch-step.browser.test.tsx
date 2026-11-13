// Added for Groupon Desk (fork of Paseo, Apache-2.0): New workspace's ticket step in a real browser.
/**
 * Tests that the ticket step above New workspace's composer offers the ticket (optional) in a
 * repository that names branches from one, shows the branch `groupon ticket name` answers on the Mac (or the
 * helper's reason), and stays away where no ticket is asked for.
 *
 * Covers: packages/app/src/groupon/ticket-branch-step.tsx
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { PluginRpcClient } from "./desk-plugin-rpc";
import type { TicketRule } from "./ticket-branch-model";
import { TicketBranchStep, useTicketBranch } from "./ticket-branch-step";

// The repository file's reader and the chats folder pull in the native router, which the browser
// project cannot bundle; the step itself and its RPC call run as they are.
vi.mock("./repository-settings", () => ({
  useRepositoryStandard: () => ({ answer: undefined, settled: true }),
}));
vi.mock("./project-less-chats", () => ({ isChatsProjectRoot: () => false }));

function noop() {}

const BRANCH = "b2b/QR-1742/ENC-1234-partner-feed-service";

let root: Root | null = null;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("React", React);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root?.unmount());
  container.remove();
});

function pluginClient(answer: unknown): { client: PluginRpcClient; asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    client: {
      invokePluginRpc: async (_plugin, method, input) => {
        asked.push([method, input]);
        return answer;
      },
    } as PluginRpcClient,
  };
}

function renderStep(rule: TicketRule, client: PluginRpcClient) {
  function Harness() {
    const { step, pick } = useTicketBranch(client);
    return (
      <TicketBranchStep
        rule={rule}
        step={step}
        initialTicket=""
        onPick={pick}
        onStartTicket={noop}
        disabled={false}
      />
    );
  }
  act(() => root?.render(<Harness />));
  return within(container);
}

async function typeAndLeave(view: ReturnType<typeof within>, text: string) {
  const field = view.getByTestId("new-workspace-ticket-key") as HTMLInputElement;
  await act(async () => {
    field.focus();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setValue?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    field.blur();
  });
}

it("offers the ticket as optional and shows the branch the helper answers for it", async () => {
  const { client, asked } = pluginClient({ kind: "named", ticket: "ENC-1234", branch: BRANCH });
  const view = renderStep("optional", client);
  expect(view.getByText(/^Optional: a Jira ticket names the branch/)).toBeTruthy();
  expect(view.queryByText(/required/i)).toBeNull();

  await typeAndLeave(view, "enc-1234");

  expect((await view.findByTestId("new-workspace-ticket-branch")).textContent).toBe(
    `Branch: ${BRANCH}`,
  );
  expect(asked).toEqual([["groupon.ticket-name", { ticket: "ENC-1234" }]]);
});

it("shows the helper's reason when it gives no branch", async () => {
  const { client } = pluginClient({ kind: "refused", reason: "ENC-1234 has no parent" });
  const view = renderStep("optional", client);

  await typeAndLeave(view, "ENC-1234");

  expect((await view.findByTestId("new-workspace-ticket-refused")).textContent).toBe(
    "ENC-1234 has no parent",
  );
});

it("shows nothing where the repository asks no ticket", async () => {
  const { client } = pluginClient(null);
  const view = renderStep("none", client);

  expect(view.queryByTestId("new-workspace-ticket-step")).toBeNull();
});
