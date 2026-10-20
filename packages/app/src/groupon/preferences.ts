// Added for Groupon Desk (fork of Paseo, Apache-2.0): Groupon Desk's own app preferences on this device.

/**
 * Preferences the fork adds, kept on this device beside Paseo's own: whether to be reminded to
 * set up worktree scripts for a project without a repository file (off by default: the owner
 * wants no such card for anyone unless they ask for it, 2026-10-19), and where From GitHub opens:
 * the GitHub host last switched to, and on each host the organisation and team last picked; and
 * the repository the Standards page read last; and the repository New workspace was last on.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

const GithubPlaceSchema = z.object({
  organisation: z.string().nullable(),
  team: z.string().nullable(),
});

const StandardsPlaceSchema = z.object({ serverId: z.string(), repoRoot: z.string() });

const GrouponPreferencesSchema = z.object({
  remindWorktreeScripts: z.boolean(),
  /** github.com's place as kept before the host switch; read through `placeOn`. */
  githubOrganisation: z.string().nullable().optional(),
  githubTeam: z.string().nullable().optional(),
  githubHost: z.string().nullable().optional(),
  githubPlaces: z.record(z.string(), GithubPlaceSchema).nullable().optional(),
  /** The Mac and checkout the Standards page read last. */
  standardsPlace: StandardsPlaceSchema.nullable().optional(),
  /** The repository New workspace was last on (`repository-picker-model.ts`'s entry id). */
  lastRepositoryId: z.string().nullable().optional(),
});

type GrouponPreferences = z.infer<typeof GrouponPreferencesSchema>;

interface GrouponPreferencesState extends GrouponPreferences {
  setRemindWorktreeScripts: (value: boolean) => void;
  rememberGithubHost: (host: string) => void;
  rememberGithubPlace: (host: string, organisation: string, team: string) => void;
  rememberStandardsPlace: (serverId: string, repoRoot: string) => void;
  rememberRepository: (repositoryId: string) => void;
}

export const DEFAULT_GROUPON_PREFERENCES: GrouponPreferences = { remindWorktreeScripts: false };

export const useGrouponPreferences = create<GrouponPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_GROUPON_PREFERENCES,
      setRemindWorktreeScripts: (value) => set({ remindWorktreeScripts: value }),
      rememberGithubHost: (host) => set({ githubHost: host }),
      rememberGithubPlace: (host, organisation, team) =>
        set((state) => ({
          githubPlaces: { ...state.githubPlaces, [host]: { organisation, team } },
        })),
      rememberStandardsPlace: (serverId, repoRoot) =>
        set({ standardsPlace: { serverId, repoRoot } }),
      rememberRepository: (repositoryId) => set({ lastRepositoryId: repositoryId }),
    }),
    {
      name: "groupon-desk-preferences",
      storage: createValidatedPersistStorage(AsyncStorage, GrouponPreferencesSchema),
      partialize: (state) => ({
        remindWorktreeScripts: state.remindWorktreeScripts,
        githubOrganisation: state.githubOrganisation ?? null,
        githubTeam: state.githubTeam ?? null,
        githubHost: state.githubHost ?? null,
        githubPlaces: state.githubPlaces ?? null,
        standardsPlace: state.standardsPlace ?? null,
        lastRepositoryId: state.lastRepositoryId ?? null,
      }),
      version: 1,
    },
  ),
);
