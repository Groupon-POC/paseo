// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for telling which chats worked on their checkout's branch.

import { describe, expect, it } from "vitest";
import { workedIn } from "./worked-workspaces.js";

const DIR = "/Users/n/projects/engineering";
const call = (detail: Record<string, unknown>, status = "completed") => ({
  item: { type: "tool_call", status, detail },
});

describe("workedIn", () => {
  it("counts an edit in the checkout, and a commit, a push or a pull request opened from it", () => {
    expect(workedIn([call({ type: "edit", filePath: `${DIR}/a.ts` })], DIR)).toBe(true);
    expect(workedIn([call({ type: "shell", command: 'git add -A; git commit -m "x"' })], DIR)).toBe(
      true,
    );
    expect(
      workedIn([call({ type: "shell", command: "git push -u origin b2b/x 2>&1 | tail -2" })], DIR),
    ).toBe(true);
    expect(workedIn([call({ type: "shell", command: "gh pr create --base staging" })], DIR)).toBe(
      true,
    );
  });

  it("leaves out reads, work in another folder, and a call that did not finish", () => {
    expect(
      workedIn([call({ type: "shell", command: "git log --oneline -3; gh pr view 428" })], DIR),
    ).toBe(false);
    expect(workedIn([call({ type: "write", filePath: "/tmp/plan.md" })], DIR)).toBe(false);
    expect(
      workedIn(
        [call({ type: "shell", command: "git push", cwd: "/Users/n/projects/monorepo" })],
        DIR,
      ),
    ).toBe(false);
    expect(workedIn([call({ type: "shell", command: "git push" }, "failed")], DIR)).toBe(false);
  });
});
