// Added for Groupon Desk (fork of Paseo, Apache-2.0): manual checkout selection stays available after automatic opening fails.
/** Browser coverage of repository-notice.tsx and the existing-folder request it opens. */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RepositoryNotice } from "./repository-notice";
import { useGithubProjectStore } from "./github-project-store";
import type { RepositoryEntry } from "./repository-picker-model";

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
  useGithubProjectStore.getState().close();
});

const checkout = {
  macId: "studio",
  serverId: "srv_studio",
  macLabel: "Mac Studio",
  path: "/Users/owner/old-location/monorepo",
  projectId: null,
};
const entry: RepositoryEntry = {
  id: "repo:github.com/groupon/groupon-monorepo",
  label: "groupon/groupon-monorepo",
  remote: "github.com/groupon/groupon-monorepo",
  project: null,
  checkouts: [checkout],
};

const choice = {
  entry,
  macLabel: "Mac Studio",
  state: { kind: "openFailed" as const, checkout, reason: "Directory not found" },
  clone: () => {
    throw new Error("Choosing an existing folder must never clone");
  },
  pickExisting: () =>
    useGithubProjectStore.getState().open("srv_studio", {
      host: "github.com",
      fullName: "groupon/groupon-monorepo",
      mode: "existing",
    }),
};

it("offers an existing folder on the selected Mac when the reported checkout does not open", () => {
  act(() => root?.render(<RepositoryNotice choice={choice} />));
  const view = within(container);
  expect(view.getByText(/Directory not found/)).toBeTruthy();
  const choose = view.getByRole("button", { name: "Choose existing folder on Mac Studio" });
  act(() => choose.click());

  expect(useGithubProjectStore.getState().request).toMatchObject({
    serverId: "srv_studio",
    prefill: { host: "github.com", fullName: "groupon/groupon-monorepo", mode: "existing" },
  });
  expect(view.queryByRole("button", { name: "Clone it on Mac Studio" })).toBeNull();
});
