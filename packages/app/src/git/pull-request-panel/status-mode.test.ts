import { describe, expect, it } from "vitest";
import type { PrPaneActivity } from "./data";
import { buildPrTimeline } from "./timeline";
import { buildPrStatusModel } from "./status-mode";
import { DEFAULT_PR_STATUS_RULES, mergePrStatusRules } from "./status-rules";

let nextId = 0;

function comment(author: string, body: string, overrides: Partial<PrPaneActivity> = {}) {
  nextId += 1;
  return {
    provider: "github",
    id: `activity-${nextId}`,
    kind: "comment",
    author,
    avatarColor: "#888",
    body,
    age: "1h ago",
    url: `https://github.com/x/y/pull/1#issuecomment-${nextId}`,
    ...overrides,
  } satisfies PrPaneActivity;
}

function review(
  author: string,
  reviewState: PrPaneActivity["reviewState"],
  body: string,
  overrides: Partial<PrPaneActivity> = {},
) {
  nextId += 1;
  return {
    provider: "github",
    id: `activity-${nextId}`,
    kind: "review",
    author,
    avatarColor: "#888",
    reviewState,
    body,
    age: "1h ago",
    url: `https://github.com/x/y/pull/1#pullrequestreview-${nextId}`,
    ...overrides,
  } satisfies PrPaneActivity;
}

function build(activities: PrPaneActivity[]) {
  return buildPrStatusModel(buildPrTimeline(activities), DEFAULT_PR_STATUS_RULES);
}

describe("buildPrStatusModel reports", () => {
  it("classifies a status-emoji heading as a report and strips the status words", () => {
    const model = build([
      comment(
        "github-actions",
        "## :white_check_mark: Hub FE - Unit Tests Passed\n\n**Commit:** `02e6195b4b`",
      ),
    ]);
    expect(model.passedReports).toHaveLength(1);
    expect(model.passedReports[0].title).toBe("Hub FE - Unit Tests");
    expect(model.passedReports[0].sha).toBe("02e6195");
    expect(model.conversation).toHaveLength(0);
  });

  it("supersedes earlier runs of the same report across statuses and dash styles", () => {
    const model = build([
      comment("github-actions", "## ❌ TypeScript Type Check Failed\n\n**Commit:** `aaaaaaaa11`"),
      comment(
        "github-actions",
        "## 🔄 TypeScript Type Check Running...\n\n**Commit:** `bbbbbbbb22`",
      ),
    ]);
    expect(model.attentionReports).toHaveLength(1);
    expect(model.attentionReports[0].status).toBe("pending");
    expect(model.attentionReports[0].supersededCount).toBe(1);
  });

  it("keeps digits out of the supersede key so changing counts still supersede", () => {
    const model = build([
      comment("bot", "## ⚠️ ORR metadata incomplete: 6 services touched by this PR"),
      comment("bot", "## ⚠️ ORR metadata incomplete: 20 services touched by this PR"),
    ]);
    expect(model.attentionReports).toHaveLength(1);
    expect(model.attentionReports[0].supersededCount).toBe(1);
  });

  it("files info reports separately", () => {
    const model = build([comment("bot", "### ⏭️ No Cloud Run preview for this PR")]);
    expect(model.infoReports).toHaveLength(1);
  });
});

describe("buildPrStatusModel reviewers", () => {
  it("groups review rounds by author and reads the verdict line", () => {
    const model = build([
      review(
        "architect",
        "changes_requested",
        "## Review @ `4bbd3580aa`\n\n**Verdict: REQUEST_CHANGES (2 blockers).** The rollout is wrong.",
      ),
    ]);
    expect(model.reviewers).toHaveLength(1);
    const [reviewer] = model.reviewers;
    expect(reviewer.latest.state).toBe("changes_requested");
    expect(reviewer.latest.sha).toBe("4bbd358");
    expect(reviewer.latest.verdictText).toContain("Verdict: REQUEST_CHANGES (2 blockers).");
    expect(reviewer.latest.severities).toEqual([{ token: "🔴", tone: "danger", count: 2 }]);
  });

  it("keeps a reviewer's rounds in timeline order, so a later review beats an earlier verdict comment", () => {
    const model = build([
      review("architect", "changes_requested", "## Review @ `aaaaaaa1`\n\n**Verdict: blocked.**"),
      comment("architect", "## Review @ `bbbbbbb2`\n\n**Verdict: Request changes. 1 🔴.**"),
      review("architect", "approved", "## Review @ `ccccccc3`\n\n**Verdict: Approve.**"),
    ]);
    const [reviewer] = model.reviewers;
    expect(reviewer.rounds.map((round) => round.sha)).toEqual(["aaaaaaa", "bbbbbbb", "ccccccc"]);
    expect(reviewer.latest.state).toBe("approved");
    expect(reviewer.latest.severities).toEqual([]);
  });

  it("reads a count written after the mark, so a zero tally shows no badge", () => {
    const model = build([
      review(
        "bot",
        "approved",
        "**Verdict: APPROVED.**\n\n#### 🔵 Suggestion\n\n| Findings total | 2 (🔴 0 · 🟡 0 · 🔵 2) |",
      ),
    ]);
    expect(model.reviewers[0].latest.severities).toEqual([{ token: "🔵", tone: "info", count: 2 }]);
  });

  it("merges a stub review with the verdict comment that names the same commit", () => {
    const model = build([
      review("architect", "changes_requested", "## Review @ `4bbd3580aa` (inline comments)"),
      comment(
        "architect",
        "## Review @ `4bbd3580aa`\n\n**Verdict: Request changes. 2 🔴, 1 🟠.**\n\nDetails…",
      ),
    ]);
    expect(model.reviewers[0].rounds).toHaveLength(1);
    const round = model.reviewers[0].rounds[0];
    expect(round.state).toBe("changes_requested");
    expect(round.severities).toEqual([
      { token: "🔴", tone: "danger", count: 2 },
      { token: "🟠", tone: "warning", count: 1 },
    ]);
    expect(model.conversation).toHaveLength(0);
  });

  it("merges the sha-less stub pattern by heading, but keeps real rounds apart", () => {
    const model = build([
      review("architect", "changes_requested", "## Architect Review — PR #1 (inline comments)"),
      comment("architect", "## Architect Review — PR #1\n\n**Verdict: REQUEST_CHANGES.** Body."),
      review(
        "architect",
        "changes_requested",
        "## Architect Review — PR #1\n\nVerdict: approve? No: full new round.",
      ),
    ]);
    expect(model.reviewers[0].rounds).toHaveLength(2);
  });

  it("never makes a reviewer out of an author with no forge review", () => {
    const model = build([
      comment("author", "Review addressed at c21f6722e3.\n\n| # | Finding | Verdict |\n|-|-|-|"),
    ]);
    expect(model.reviewers).toHaveLength(0);
    expect(model.conversation).toHaveLength(1);
  });

  it("takes the API state over the verdict text and reads a gate", () => {
    const model = build([
      review(
        "iq-bot",
        "changes_requested",
        "> disclaimer\n\n## ⛔ BLOCKED — Principal Review Required\n\n**Verdict: CHANGES REQUESTED.**\n\n#### 🔴 Blocking\n1. one\n2. two",
      ),
    ]);
    const [reviewer] = model.reviewers;
    expect(reviewer.latest.gated).toBe(true);
    expect(reviewer.latest.state).toBe("changes_requested");
  });

  it("falls back to the first meaningful line when there is no verdict", () => {
    const model = build([
      review("coderabbitai", "commented", "<!-- marker -->\n\n**Actionable comments posted: 2**"),
    ]);
    expect(model.reviewers[0].latest.verdictText).toBe("Actionable comments posted: 2");
  });
});

describe("buildPrStatusModel leftovers", () => {
  it("aggregates repeated slash commands", () => {
    const model = build([comment("author", "/frontend-e2e"), comment("author", "/frontend-e2e")]);
    expect(model.commands).toHaveLength(1);
    expect(model.commands[0].count).toBe(2);
  });

  it("keeps notices in the conversation even when they carry a status emoji", () => {
    const model = build([
      comment("iq-bot", "👀 The review bot has picked up this pull request. ✅"),
    ]);
    expect(model.conversation).toHaveLength(1);
    expect(model.passedReports).toHaveLength(0);
  });

  it("leaves what it cannot place in the conversation, in order", () => {
    const model = build([
      comment("someone", "Just a plain question about the approach?"),
      comment("someone", "![screenshot](https://example.com/x.png)"),
    ]);
    expect(model.conversation).toHaveLength(2);
  });
});

describe("mergePrStatusRules", () => {
  it("lays token overrides over the defaults", () => {
    const rules = mergePrStatusRules({ statusTokens: { "🧪": "pending" } });
    expect(rules.statusTokens["🧪"]).toBe("pending");
    expect(rules.statusTokens["✅"]).toBe("success");
  });

  it("ignores an override that fails the schema", () => {
    expect(mergePrStatusRules({ statusTokens: { "✅": "nonsense" } })).toEqual(
      DEFAULT_PR_STATUS_RULES,
    );
    expect(mergePrStatusRules("garbage")).toEqual(DEFAULT_PR_STATUS_RULES);
  });

  it("survives a broken regex in an override", () => {
    const rules = mergePrStatusRules({ gatePattern: "([" });
    const model = buildPrStatusModel(
      buildPrTimeline([review("bot", "approved", "Verdict: approve")]),
      rules,
    );
    expect(model.reviewers[0].latest.gated).toBe(false);
  });
});
