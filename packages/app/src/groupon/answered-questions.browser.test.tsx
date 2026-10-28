// Added for Groupon Desk (fork of Paseo, Apache-2.0): an answered question call in the history shows its choices, disabled.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { within } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnsweredQuestions } from "./answered-questions";

// App sources compile against the classic JSX runtime, which expects React on the global.
beforeEach(() => vi.stubGlobal("React", React));

const mounted: { root: Root; container: HTMLDivElement }[] = [];

afterEach(() => {
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  mounted.push({ root, container });
  return within(container);
}

const INPUT = {
  questions: [
    {
      question: "Who makes the worktree?",
      header: "Worktree",
      multiSelect: false,
      options: [{ label: "Desk adopts the agent's" }, { label: "Desk makes it" }],
    },
    {
      question: "Commit what is done?",
      header: "Commit",
      multiSelect: false,
      options: [{ label: "Commit" }, { label: "Not yet" }],
    },
  ],
};
const OUTPUT =
  'Your questions have been answered: "Who makes the worktree?"="Desk makes it", "Commit what is done?"="Not yet". You can now continue with these answers in mind.';

describe("an answered question in the history", () => {
  it("shows the picked option checked and every option disabled", () => {
    const view = mount(<AnsweredQuestions input={INPUT} output={OUTPUT} />);

    const picked = view.getByRole("radio", { name: "Desk makes it" });
    const other = view.getByRole("radio", { name: "Desk adopts the agent's" });

    expect(view.getByText("Who makes the worktree?")).toBeTruthy();
    expect(picked.getAttribute("aria-checked")).toBe("true");
    expect(other.getAttribute("aria-checked")).toBe("false");
    expect(picked.getAttribute("aria-disabled")).toBe("true");
    expect(other.getAttribute("aria-disabled")).toBe("true");
  });

  it("lets the person browse to the next question and see its answer", () => {
    const view = mount(<AnsweredQuestions input={INPUT} output={OUTPUT} />);

    act(() => {
      view.getByRole("tab", { name: "Question 2 of 2" }).click();
    });

    expect(view.getByText("Commit what is done?")).toBeTruthy();
    expect(view.getByRole("radio", { name: "Not yet" }).getAttribute("aria-checked")).toBe("true");
  });
});
