// Added for Groupon Desk (fork of Paseo, Apache-2.0): tests for What's new in the work window.
/**
 * @vitest-environment jsdom
 *
 * Tests for What's new in the work window: Paseo's release notes are neither opened nor fetched.
 *
 * Covers:  changelog/open-changelog.ts, changelog/internal/changelog-source.ts
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CHANGELOG_URL, useChangelog } from "./internal/changelog-source";
import { useChangelogStore } from "./internal/changelog-store";
import { openChangelog } from "./open-changelog";

afterEach(() => {
  useChangelogStore.getState().close();
  vi.unstubAllGlobals();
});

describe("What's new", () => {
  it("is Paseo's page, which the window's policy does not name", () => {
    expect(new URL(CHANGELOG_URL).hostname).toBe("raw.githubusercontent.com");
  });

  it("does not open", () => {
    openChangelog();
    expect(useChangelogStore.getState().visible).toBe(false);
  });

  it("does not fetch, even when asked to load", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderHook(() => useChangelog(true));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
