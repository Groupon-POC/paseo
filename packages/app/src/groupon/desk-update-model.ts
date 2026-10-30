// Added for Groupon Desk (fork of Paseo, Apache-2.0): what the sidebar's update row says.

/**
 * The sidebar's "an update is available" row (owner, 2026-10-29): shown when this Mac's Groupon
 * Desk or its `groupon` CLI is behind the company's shelf, naming what is newer.
 */

import type { DeskUpdateAnswer } from "./desk-plugin-rpc";

/** "Groupon Desk 2.0.8601 and the command line 2.0.8601"; null when nothing is newer. */
export function deskUpdateWhat(answer: DeskUpdateAnswer | null | undefined): string | null {
  if (!answer) return null;
  const parts: string[] = [];
  if (answer.desk.updateAvailable && answer.desk.latest) parts.push(`Groupon Desk ${answer.desk.latest}`);
  if (answer.cli.updateAvailable && answer.cli.latest) parts.push(`the command line ${answer.cli.latest}`);
  return parts.length > 0 ? parts.join(" and ") : null;
}
