// Added for Groupon Desk (fork of Paseo, Apache-2.0): the worktree-scripts reminder is off unless asked for; From GitHub's remembered place.
import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const items = new Map<string, string>();
  return {
    default: {
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: string) => void items.set(key, value),
      removeItem: async (key: string) => void items.delete(key),
    },
  };
});

const { DEFAULT_GROUPON_PREFERENCES, useGrouponPreferences } = await import("./preferences");

describe("Groupon Desk's preferences", () => {
  it("does not remind anyone to set up worktree scripts unless they turn it on", () => {
    expect(DEFAULT_GROUPON_PREFERENCES.remindWorktreeScripts).toBe(false);
    expect(useGrouponPreferences.getState().remindWorktreeScripts).toBe(false);
    useGrouponPreferences.getState().setRemindWorktreeScripts(true);
    expect(useGrouponPreferences.getState().remindWorktreeScripts).toBe(true);
  });

  it("remembers the GitHub host From GitHub opens on, and the organisation and team per host", () => {
    expect(useGrouponPreferences.getState().githubHost ?? null).toBeNull();
    const prefs = useGrouponPreferences.getState();
    prefs.rememberGithubHost("github.groupondev.com");
    prefs.rememberGithubPlace("github.com", "groupon2", "web");
    prefs.rememberGithubPlace("github.groupondev.com", "Mobile-Next", "*");
    expect(useGrouponPreferences.getState()).toMatchObject({
      githubHost: "github.groupondev.com",
      githubPlaces: {
        "github.com": { organisation: "groupon2", team: "web" },
        "github.groupondev.com": { organisation: "Mobile-Next", team: "*" },
      },
    });
  });
});
