// Added for Groupon Desk (fork of Paseo, Apache-2.0): which of Paseo's own web pages the work window links to: none.

/**
 * Paseo's site, documentation, changelog, Discord, GitHub and downloads describe Paseo under
 * Paseo's name, not Groupon Desk (owner, 2026-10-20: "erase the traces of Paseo"). Off: a link,
 * a docs button or a menu item that leads there draws nothing, and the screen keeps its own words.
 * Attribution stays where the licence wants it: `LICENSE` and `GROUPON-FORK.md`.
 */
export const PASEO_WEB_LINKS = false;

/**
 * Paseo's `paseo` command line in Settings, Integrations: the engine's own command, which Groupon
 * Desk never asks a person to type (their command line is `groupon`).
 */
export const PASEO_CLI_INSTALL = false;

const PASEO_HOSTS = new Set(["paseo.sh", "app.paseo.sh", "discord.gg"]);

/** Whether the address is one of Paseo's own pages (its site, its GitHub, its Discord). */
export function isPaseoWebUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (PASEO_HOSTS.has(host) || host.endsWith(".paseo.sh")) return true;
  if (host === "github.com" || host === "raw.githubusercontent.com") {
    return parsed.pathname.toLowerCase().startsWith("/getpaseo/");
  }
  return false;
}

/** Whether the window shows a link to the address. */
export function showsWebLink(url: string): boolean {
  return PASEO_WEB_LINKS || !isPaseoWebUrl(url);
}
