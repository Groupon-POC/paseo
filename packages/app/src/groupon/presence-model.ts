// Added for Groupon Desk (fork of Paseo, Apache-2.0): who is in a workspace now, as the window draws it, pure.

/**
 * The presence row above the composer (monorepo design
 * `_documentation/design/groupon-desk-work-window-design.md`, section 13.8): the people the hub
 * says have the workspace open, as initials chips, and the Mac that runs the agent.
 *
 * - Only you in it: no chips. The owner gets a Share chip instead, a colleague nothing.
 * - Anybody else in it: a chip per person (the owner first, you marked), then the Mac; pressing
 *   the row opens Share for the workspace.
 *
 * Nothing here reaches the network; the hook passes the hub's answer in.
 */

import type { HubPresencePerson, HubWorkspacePresence } from "./hub";
import { GROUPON_PRESENCE } from "./strings";

/** The window checks in this often while a workspace is on screen; the hub forgets a mark after three missed. */
export const PRESENCE_POLL_MS = 15_000;

export interface PresenceChip {
  key: string;
  kind: "person" | "hand";
  /** One or two letters; the Mac's chip carries none (the window draws an icon). */
  initials: string;
  tooltip: string;
  you: boolean;
}

export type PresenceView =
  | { kind: "hidden" }
  | { kind: "share" }
  | { kind: "people"; chips: PresenceChip[]; label: string };

/** Up to two initials of a name, or the first letter of the email when the name is empty. */
export function initials(name: string, email = ""): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0][0]}${words[words.length - 1][0]}` : (words[0]?.[0] ?? "");
  return (letters || email.trim()[0] || "?").toUpperCase();
}

/** What a window calls the device it runs on, as the hub stores it. */
export function deviceName(os: string, isElectron: boolean): string {
  if (isElectron) return "Mac app";
  if (os === "ios") return "iPhone";
  if (os === "android") return "Android";
  return "web";
}

function personFacts(person: HubPresencePerson): string[] {
  const facts: string[] = [];
  if (person.you) facts.push(GROUPON_PRESENCE.you);
  if (person.role === "owner") facts.push(GROUPON_PRESENCE.owner);
  else facts.push(person.role === "write" ? GROUPON_PRESENCE.canWrite : GROUPON_PRESENCE.canRead);
  if (person.devices.length > 0) facts.push(person.devices.join(", "));
  return facts;
}

/** One line per person, as the Share screen's "People in this session now" lists them. */
export function presenceLines(presence: HubWorkspacePresence | null | undefined): string[] {
  return (presence?.people ?? []).map((person) =>
    GROUPON_PRESENCE.person(person.name || person.email, personFacts(person)),
  );
}

/** What the row above the composer shows for the hub's answer, for the owner or for a colleague. */
export function presenceView(
  presence: HubWorkspacePresence | null | undefined,
  viewer: "owner" | "colleague",
): PresenceView {
  if (!presence) return { kind: "hidden" };
  const others = presence.people.filter((person) => !person.you);
  if (others.length === 0) return viewer === "owner" ? { kind: "share" } : { kind: "hidden" };
  const chips: PresenceChip[] = presence.people.map((person) => ({
    key: person.userId,
    kind: "person",
    initials: initials(person.name, person.email),
    tooltip: GROUPON_PRESENCE.person(person.name || person.email, personFacts(person)),
    you: person.you,
  }));
  if (presence.hand) {
    chips.push({
      key: `hand:${presence.hand.machine}`,
      kind: "hand",
      initials: "",
      tooltip: GROUPON_PRESENCE.hand(presence.hand.label, presence.hand.connected),
      you: false,
    });
  }
  return { kind: "people", chips, label: GROUPON_PRESENCE.rowLabel(presence.people.length) };
}
