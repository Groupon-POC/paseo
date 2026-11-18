// Added for Groupon Desk (fork of Paseo, Apache-2.0): what a Groupon subscription card in the Usage modal offers.

/**
 * The Usage modal's "Groupon subscriptions" cards (the plugin's `server/usage-source.ts`, one card
 * per subscription registered in Groupon Desk) each get the switch the composer's subscription pill
 * has (the plugin's `client/subscription-pill.tsx`): "In use" on the Mac's default Claude Code
 * sign-in, Switch on the others, all held while one switches.
 *
 * Constraints:
 * - A card is matched to a subscription by its Provider detail (`providerId`); the plugin's
 *   `UsageReport` has no action slot and no email, so a card without that detail offers nothing
 * - A refusal whose fix is a new sign-in in Groupon Desk offers no Switch, which would only be
 *   refused again (the plugin's `refusalOf`)
 */

import type { UsageReportEntry } from "@/usage/types";
import type { MacSubscriptionAnswer } from "./desk-plugin-rpc";

/** The plugin's usage source id (`USAGE_SOURCE_ID`). */
export const GROUPON_SUBSCRIPTIONS_SOURCE_ID = "groupon-subscriptions";
/** The detail row that carries the subscription's provider alias id. */
const PROVIDER_DETAIL_ID = "provider";

/** The switch this window asked for, until it is answered. */
export type SubscriptionSwitchStatus =
  | { kind: "idle" }
  | { kind: "switching"; email: string }
  | { kind: "failed"; email: string; message: string };

export type CardSwitchAction =
  | { kind: "in-use" }
  | { kind: "switching" }
  | { kind: "sign-in-again" }
  | { kind: "switch"; email: string; disabled: boolean };

export interface CardSwitch {
  action: CardSwitchAction;
  /** Groupon Desk's refusal of the last switch to this subscription; null otherwise. */
  refusal: string | null;
  /** The Mac's name as the hub knows it, "this Mac" before it is known. */
  machine: string;
}

/** The provider alias a Groupon subscriptions card is for; null on any other card. */
export function cardProviderId(entry: UsageReportEntry): string | null {
  if (entry.sourceId !== GROUPON_SUBSCRIPTIONS_SOURCE_ID) return null;
  // A failed read keeps the last good report's details on screen, so it keeps its switch too.
  const report = entry.report.status === "available" ? entry.report : entry.lastSuccessful?.report;
  if (report?.status !== "available") return null;
  const detail = report.details?.find((row) => row.id === PROVIDER_DETAIL_ID);
  return detail?.value ? detail.value : null;
}

/** The last switch Groupon Desk refused, from this modal or anywhere else in the window. */
function refusalOf(
  status: SubscriptionSwitchStatus,
  last: MacSubscriptionAnswer["lastSwitch"],
): { email: string; message: string } | null {
  if (status.kind === "failed") return { email: status.email, message: status.message };
  if (status.kind === "idle" && last?.state === "failed") {
    return {
      email: last.email,
      message: last.message ?? `Groupon Desk could not switch to ${last.email}.`,
    };
  }
  return null;
}

/** The email a switch is under way to, asked here or anywhere else in the window; null when none is. */
function pendingEmail(
  status: SubscriptionSwitchStatus,
  last: MacSubscriptionAnswer["lastSwitch"],
): string | null {
  if (status.kind === "switching") return status.email;
  return last?.state === "switching" ? last.email : null;
}

const sameEmail = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/** What one card offers; null when it is no registered subscription of that Mac. */
export function cardSwitchOf(
  providerId: string | null,
  view: MacSubscriptionAnswer | undefined,
  status: SubscriptionSwitchStatus,
): CardSwitch | null {
  if (!providerId || !view) return null;
  const row = view.subscriptions.find((subscription) => subscription.providerId === providerId);
  if (!row) return null;
  const machine = view.machine ?? "this Mac";
  const pending = pendingEmail(status, view.lastSwitch);
  const refused = refusalOf(status, view.lastSwitch);
  const refusal = refused && sameEmail(refused.email, row.email) ? refused.message : null;
  if (pending !== null && sameEmail(pending, row.email)) {
    return { action: { kind: "switching" }, refusal: null, machine };
  }
  if (row.active) return { action: { kind: "in-use" }, refusal: null, machine };
  if (refusal && /sign in again/i.test(refusal)) {
    return { action: { kind: "sign-in-again" }, refusal, machine };
  }
  return {
    action: { kind: "switch", email: row.email, disabled: pending !== null },
    refusal,
    machine,
  };
}
