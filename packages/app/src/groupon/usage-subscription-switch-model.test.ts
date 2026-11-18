// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a Groupon subscription card in the Usage modal offers.
import { describe, expect, it } from "vitest";
import type { UsageReportEntry } from "@/usage/types";
import type { MacSubscriptionAnswer, MacSubscriptionRow } from "./desk-plugin-rpc";
import {
  cardProviderId,
  cardSwitchOf,
  GROUPON_SUBSCRIPTIONS_SOURCE_ID,
} from "./usage-subscription-switch-model";

function card(providerId: string | null, sourceId = GROUPON_SUBSCRIPTIONS_SOURCE_ID) {
  const report = {
    status: "available" as const,
    windows: [],
    details: [
      { id: "reading", label: "Reading", value: "2 min old, read on this Mac" },
      ...(providerId ? [{ id: "provider", label: "Provider", value: providerId }] : []),
    ],
  };
  return {
    id: `${sourceId}:acct`,
    account: { label: "Claude · a@skunks.cz (Max)" },
    fetchedAt: "2026-11-17T10:00:00.000Z",
    sourceId,
    sourceLabel: "Groupon subscriptions",
    report,
  } satisfies UsageReportEntry;
}

function row(email: string, providerId: string | null, active = false): MacSubscriptionRow {
  return {
    email,
    name: email.split("@")[0] ?? email,
    plan: "Max",
    providerId,
    active,
    sessionPct: null,
    weeklyPct: null,
    modelWindows: [],
  };
}

function view(overrides: Partial<MacSubscriptionAnswer> = {}): MacSubscriptionAnswer {
  return {
    machine: "Studio",
    unregisteredEmail: null,
    subscriptions: [
      row("a@skunks.cz", "claude-aaaaaaaa", true),
      row("b@skunks.cz", "claude-bbbbbbbb"),
    ],
    rotation: { autoRotate: false, effective: false },
    lastSwitch: null,
    ...overrides,
  };
}

const IDLE = { kind: "idle" } as const;

describe("cardProviderId", () => {
  it("reads the Provider detail of a Groupon subscriptions card only", () => {
    expect(cardProviderId(card("claude-58de8b7a"))).toBe("claude-58de8b7a");
    expect(cardProviderId(card(null))).toBeNull();
    expect(cardProviderId(card("claude-58de8b7a", "claude"))).toBeNull();
  });

  it("keeps the last good report's provider while a read fails", () => {
    const good = card("claude-58de8b7a");
    const failed: UsageReportEntry = {
      ...good,
      report: { status: "error", error: "boom" },
      lastSuccessful: { fetchedAt: good.fetchedAt, report: good.report },
    };
    expect(cardProviderId(failed)).toBe("claude-58de8b7a");
    expect(cardProviderId({ ...good, report: { status: "error", error: "boom" } })).toBeNull();
  });
});

describe("cardSwitchOf", () => {
  it("says In use on the Mac's sign-in and Switch on the others", () => {
    expect(cardSwitchOf("claude-aaaaaaaa", view(), IDLE)?.action).toEqual({ kind: "in-use" });
    expect(cardSwitchOf("claude-bbbbbbbb", view(), IDLE)).toEqual({
      action: { kind: "switch", email: "b@skunks.cz", disabled: false },
      refusal: null,
      machine: "Studio",
    });
  });

  it("offers nothing on a card that is no registered subscription, or before the Mac answers", () => {
    expect(cardSwitchOf("claude-cccccccc", view(), IDLE)).toBeNull();
    expect(cardSwitchOf(null, view(), IDLE)).toBeNull();
    expect(cardSwitchOf("claude-bbbbbbbb", undefined, IDLE)).toBeNull();
  });

  it("holds every Switch while one switches, here or from elsewhere in the window", () => {
    const third = view({
      subscriptions: [...view().subscriptions, row("c@skunks.cz", "claude-cccccccc")],
    });
    const here = { kind: "switching", email: "b@skunks.cz" } as const;
    expect(cardSwitchOf("claude-bbbbbbbb", third, here)?.action).toEqual({ kind: "switching" });
    expect(cardSwitchOf("claude-cccccccc", third, here)?.action).toEqual({
      kind: "switch",
      email: "c@skunks.cz",
      disabled: true,
    });
    const elsewhere = view({
      ...third,
      lastSwitch: { id: "1", email: "C@skunks.cz", state: "switching", message: null, at: "x" },
    });
    expect(cardSwitchOf("claude-cccccccc", elsewhere, IDLE)?.action).toEqual({ kind: "switching" });
    expect(cardSwitchOf("claude-bbbbbbbb", elsewhere, IDLE)?.action).toMatchObject({
      disabled: true,
    });
  });

  it("shows Groupon Desk's refusal on its card, and no Switch when the fix is a new sign-in", () => {
    const failed = { kind: "failed", email: "b@skunks.cz", message: "Busy, try again." } as const;
    expect(cardSwitchOf("claude-bbbbbbbb", view(), failed)).toMatchObject({
      action: { kind: "switch", disabled: false },
      refusal: "Busy, try again.",
    });
    expect(cardSwitchOf("claude-aaaaaaaa", view(), failed)?.refusal).toBeNull();
    const signIn = view({
      lastSwitch: {
        id: "1",
        email: "b@skunks.cz",
        state: "failed",
        message: "Sign in again in Groupon Desk.",
        at: "x",
      },
    });
    expect(cardSwitchOf("claude-bbbbbbbb", signIn, IDLE)).toMatchObject({
      action: { kind: "sign-in-again" },
      refusal: "Sign in again in Groupon Desk.",
    });
  });
});
