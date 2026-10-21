// Changed for Groupon Desk (fork of Paseo, Apache-2.0): opens nothing while Paseo's web links are off; the sheet shows Paseo's release notes.
import { showsWebLink } from "@/groupon/paseo-web-links";
import { CHANGELOG_URL } from "./internal/changelog-source";
import { useChangelogStore } from "./internal/changelog-store";

/** Opens the What's new sheet from anywhere, including outside React. */
export function openChangelog(): void {
  if (!showsWebLink(CHANGELOG_URL)) return;
  useChangelogStore.getState().open();
}
