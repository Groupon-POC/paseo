// Added for Groupon Desk (fork of Paseo, Apache-2.0): the Standards page's choices and words.
import { describe, expect, it } from "vitest";
import type { StandardsAnswer } from "./desk-plugin-rpc";
import {
  chosenDocument,
  chosenProject,
  documentHint,
  markdownBody,
  unwrapParagraphs,
  pullLabel,
  standardsProjectsOf,
  standardsSourceText,
} from "./standards-model";

const BRANCHING = {
  file: "branching.md",
  title: "Branch policy",
  group: "Git",
  summary: null,
  status: "reporting",
  since: "2026-09-17",
};
const PULL_REQUESTS = { ...BRANCHING, file: "pull-requests.md", title: "Pull request titles" };

const PULLED: StandardsAnswer = {
  layout: "pulled",
  folder: ".standards/_documentation/engineering-standards",
  version: "2026-10-20.4a97a2a",
  canPull: true,
  documents: [BRANCHING, PULL_REQUESTS],
  document: null,
  pull: null,
  problem: null,
  readAt: "2026-10-20T12:00:00.000Z",
};

const host = (serverId: string, repoRoot: string, isOnline = true) => ({
  serverId,
  serverName: serverId === "mac" ? "Work Mac" : "Home Mac",
  repoRoot,
  isOnline,
  projectCustomName: null,
});

describe("the repository the page reads", () => {
  const projects = standardsProjectsOf([
    { projectName: "paseo", hosts: [host("mac", "/src/paseo")] },
    {
      projectName: "engineering-development",
      hosts: [host("mac", "/src/ed"), host("home", "/h/ed", false)],
    },
  ]);

  it("lists one row per Mac and checkout, online Macs first, by name", () => {
    expect(projects.map((project) => `${project.name}@${project.serverId}`)).toEqual([
      "engineering-development@mac",
      "paseo@mac",
      "engineering-development@home",
    ]);
  });

  it("keeps the one picked last time, else the first", () => {
    expect(chosenProject(projects, { serverId: "mac", repoRoot: "/src/paseo" })?.name).toBe(
      "paseo",
    );
    expect(chosenProject(projects, { serverId: "mac", repoRoot: "/gone" })?.repoRoot).toBe(
      "/src/ed",
    );
    expect(chosenProject([], null)).toBeNull();
  });
});

describe("the document the page opens", () => {
  it("opens the one picked, else the branch-name standard at the top", () => {
    expect(chosenDocument(PULLED.documents, "pull-requests.md")?.file).toBe("pull-requests.md");
    expect(chosenDocument(PULLED.documents, "gone.md")?.file).toBe("branching.md");
    expect(chosenDocument([], null)).toBeNull();
  });

  it("says a document's group, how binding it is and since when", () => {
    expect(documentHint(BRANCHING)).toBe("Git · reporting · since 2026-09-17");
    expect(documentHint({ ...BRANCHING, group: null, status: "binding", since: null })).toBe(
      "binding",
    );
  });
});

describe("where the standards were read from", () => {
  it("names the pulled copy with its version, the source as the repository's own", () => {
    expect(standardsSourceText(PULLED)).toBe(
      ".standards/_documentation/engineering-standards (pulled, version 2026-10-20.4a97a2a)",
    );
    expect(
      standardsSourceText({
        ...PULLED,
        layout: "source",
        folder: "_documentation/engineering-standards",
        version: null,
      }),
    ).toBe(
      "_documentation/engineering-standards: this repository's own files, where the standards are written",
    );
    expect(
      standardsSourceText({ ...PULLED, layout: "none", folder: null, documents: [] }),
    ).toBeNull();
  });

  it("offers to pull again once pulled", () => {
    expect(pullLabel(PULLED)).toBe("Pull again");
    expect(pullLabel({ ...PULLED, layout: "none" })).toBe("Pull the standards");
  });
});

describe("markdownBody", () => {
  it("drops the front matter the page already shows above the document", () => {
    expect(
      markdownBody(
        "---\ntitle: Branch policy\nstatus: reporting\n---\n\n# Branch policy\n\nText.\n",
      ),
    ).toBe("# Branch policy\n\nText.\n");
    expect(markdownBody("# No front matter\n\n---\n")).toBe("# No front matter\n\n---\n");
  });
});

describe("unwrapParagraphs", () => {
  it("joins a paragraph wrapped at a column, and leaves every other block as written", () => {
    const source = [
      "Every branch in every Groupon repository is named",
      "the same way, and nobody types the name.",
      "",
      "## The format",
      "",
      "```",
      "<tribe>/<INITIATIVE-KEY>/",
      "<TICKET-KEY>-<slug>",
      "```",
      "",
      "| Segment | What |",
      "| --- | --- |",
      "| tribe | the team |",
      "",
      "- one item",
      "  continued",
      "- two",
      "hard break  ",
      "kept",
    ].join("\n");
    expect(unwrapParagraphs(source).split("\n")).toEqual([
      "Every branch in every Groupon repository is named the same way, and nobody types the name.",
      "",
      "## The format",
      "",
      "```",
      "<tribe>/<INITIATIVE-KEY>/",
      "<TICKET-KEY>-<slug>",
      "```",
      "",
      "| Segment | What |",
      "| --- | --- |",
      "| tribe | the team |",
      "",
      "- one item continued",
      "- two hard break  ",
      "kept",
    ]);
  });
});
