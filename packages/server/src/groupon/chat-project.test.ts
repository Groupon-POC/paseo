// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for finding the project an agent moves its chat into.

import { describe, expect, it } from "vitest";
import { projectNamed } from "./chat-project.js";

const PROJECTS = [
  { projectId: "p1", name: "engineering", rootPath: "/Users/n/projects/groupon-2/engineering" },
  { projectId: "p2", name: "management", rootPath: "/Users/n/projects/management" },
];

describe("projectNamed", () => {
  it("finds a project by its name in any case, or by its id", () => {
    expect(projectNamed(PROJECTS, "Management").projectId).toBe("p2");
    expect(projectNamed(PROJECTS, "p1").name).toBe("engineering");
  });

  it("refuses an unknown name with the projects to pick from, and an ambiguous one", () => {
    expect(() => projectNamed(PROJECTS, "tempo")).toThrow(
      'No project "tempo" on this Mac; its projects: engineering, management',
    );
    expect(() =>
      projectNamed([...PROJECTS, { ...PROJECTS[1]!, projectId: "p3" }], "management"),
    ).toThrow(/give its id/);
  });
});
