// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the Encore card says.
import { describe, expect, it } from "vitest";
import type { EncoreAppState, EncoreRollout } from "./desk-plugin-rpc";
import {
  accessOffer,
  checksText,
  rolloutLine,
  rolloutTone,
  shortTime,
  standingText,
} from "./encore-state-model";

const ROLLOUT: EncoreRollout = {
  rolloutId: "roll_abc",
  status: "completed",
  conclusion: "success",
  commitShort: "0b67a96a02",
  queuedAt: "2026-10-19T08:00:00.000Z",
  startedAt: "2026-10-19T08:01:00.000Z",
  completedAt: "2026-10-19T08:11:00.000Z",
  dashboardUrl: "https://app.encore.cloud/groupon-core-v3s2/envs/staging/deploys/abc",
};

function app(overrides: Partial<EncoreAppState> = {}): EncoreAppState {
  return {
    key: "core",
    slug: "groupon-core-v3s2",
    name: "Core",
    standing: "not-member",
    role: null,
    requestPending: false,
    approver: "owner@groupon.com",
    environments: [],
    ...overrides,
  };
}

describe("the Encore card's words", () => {
  it("says a finished rollout's conclusion, commit and time, in UTC", () => {
    expect(rolloutLine(ROLLOUT)).toBe("success · 0b67a96a02 · 2026-10-19 08:11 UTC");
    expect(rolloutTone(ROLLOUT)).toBe("good");
  });

  it("says where a rollout in flight is, from the time it started", () => {
    const running = { ...ROLLOUT, status: "running", conclusion: "pending", completedAt: null };
    expect(rolloutLine(running)).toBe("running · 0b67a96a02 · 2026-10-19 08:01 UTC");
    expect(rolloutTone(running)).toBe("neutral");
  });

  it("marks a failed rollout and says when none was reported", () => {
    expect(rolloutTone({ ...ROLLOUT, conclusion: "failure" })).toBe("bad");
    expect(rolloutLine(null)).toBe("no rollout reported yet");
    expect(shortTime("not a time")).toBeNull();
  });

  it("says who decides a waiting request", () => {
    expect(standingText(app({ requestPending: true }))).toBe(
      "Your request for access waits for a decision by owner@groupon.com",
    );
    expect(standingText(app({ standing: "member", role: "writer" }))).toBe(
      "You are a member (writer)",
    );
  });

  it("offers access to somebody who is not a member, and to somebody nobody could say about", () => {
    expect(accessOffer(app())).toBe("ask");
    expect(accessOffer(app({ standing: "unknown", requestPending: null }))).toBe("ask-unknown");
  });

  it("offers nothing to a member, the invited, a request already waiting, or an app not handed out", () => {
    expect(accessOffer(app({ standing: "member" }))).toBe("none");
    expect(accessOffer(app({ standing: "invited" }))).toBe("none");
    expect(accessOffer(app({ requestPending: true }))).toBe("none");
    expect(accessOffer(app({ standing: "not-handed-out" }))).toBe("none");
  });

  it("says the train's checks in words", () => {
    expect(
      checksText({ number: 1, title: "t", url: "u", checks: "failing", createdAt: null }),
    ).toBe("checks failing");
  });
});
