// Added for Groupon Desk (fork of Paseo, Apache-2.0): the work window links none of Paseo's own pages.
import { describe, expect, it } from "vitest";
import { isPaseoWebUrl, showsWebLink } from "./paseo-web-links";

describe("Paseo's own web pages", () => {
  it("are its site, docs, GitHub, changelog and Discord", () => {
    for (const url of [
      "https://paseo.sh",
      "https://paseo.sh/docs/worktrees",
      "https://app.paseo.sh/#offer=x",
      "https://github.com/getpaseo/paseo/issues/new",
      "https://raw.githubusercontent.com/getpaseo/paseo/main/CHANGELOG.md",
      "https://discord.gg/jz8T2uahpH",
    ]) {
      expect(isPaseoWebUrl(url)).toBe(true);
      expect(showsWebLink(url)).toBe(false);
    }
  });

  it("leave every other address shown", () => {
    for (const url of [
      "https://github.com/groupon-poc/paseo",
      "https://docs.anthropic.com/en/docs/claude-code",
      "https://api-staging-internal.livingsocial.com/atlas/cli/groupon-desk.dmg",
      "not a url",
    ]) {
      expect(showsWebLink(url)).toBe(true);
    }
  });
});
