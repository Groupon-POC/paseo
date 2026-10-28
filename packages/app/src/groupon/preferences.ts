// Added for Groupon Desk (fork of Paseo, Apache-2.0): Groupon Desk's own app preferences on this device. And whether My tasks shows under the New workspace composer, whether the diff viewer shows only the selected file, the agent output's width, and what Changes compares by default.

/**
 * Preferences the fork adds, kept on this device beside Paseo's own: whether to be reminded to
 * set up worktree scripts for a project without a repository file (off by default: the owner
 * wants no such card for anyone unless they ask for it, 2026-10-19), and where From GitHub opens:
 * the GitHub host last switched to, and on each host the organisation and team last picked; and
 * the repository the Standards page read last; and the repository New workspace was last on; whether the add-to-home-screen card was dismissed; and whether the sidebar's computers and limits are folded to two lines;
 * and whether Local stays in the checkout on a shared trunk (off by default: Local there becomes a worktree).
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
  /** "Not now" on the add-to-home-screen card (`install-card.tsx`), kept on this device. */
  installCardDismissed: z.boolean().optional(),
  /** The sidebar's Connected computers and limits folded to two lines (owner, 2026-10-28). */
  footerPanelCollapsed: z.boolean().optional(),
  /** Local stays in the checkout even on a shared trunk, instead of becoming a worktree. */
  localInPlaceOnTrunk: z.boolean().optional(),
  /** My tasks under the New workspace composer (on by default). */
  showMyTasks: z.boolean().optional(),
  /** The diff viewer shows only the file picked in the Changes panel (off by default: every file). */
  diffSelectedFileOnly: z.boolean().optional(),
  /** The agent output's width as a share of its pane, for every chat (`stream-width.ts`); null: the content width. */
  streamWidthShare: z.number().min(0).max(1).nullable().optional(),
  /** What the Changes views compare by default: All changes (as Paseo), or what the session changed. */
  changesDefaultComparison: z.enum(["all", "session"]).optional(),
});

type GrouponPreferences = z.infer<typeof GrouponPreferencesSchema>;

interface GrouponPreferencesState extends GrouponPreferences {
  setRemindWorktreeScripts: (value: boolean) => void;
  setLocalInPlaceOnTrunk: (value: boolean) => void;
  setShowMyTasks: (value: boolean) => void;
  setDiffSelectedFileOnly: (value: boolean) => void;
  setStreamWidthShare: (value: number | null) => void;
  setChangesDefaultComparison: (value: "all" | "session") => void;
  rememberGithubHost: (host: string) => void;
  rememberGithubPlace: (host: string, organisation: string, team: string) => void;
  rememberStandardsPlace: (serverId: string, repoRoot: string) => void;
  rememberRepository: (repositoryId: string) => void;
  dismissInstallCard: () => void;
  setFooterPanelCollapsed: (value: boolean) => void;
}

export const DEFAULT_GROUPON_PREFERENCES: GrouponPreferences = { remindWorktreeScripts: false };

export const useGrouponPreferences = create<GrouponPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_GROUPON_PREFERENCES,
      setRemindWorktreeScripts: (value) => set({ remindWorktreeScripts: value }),
      setLocalInPlaceOnTrunk: (value) => set({ localInPlaceOnTrunk: value }),
      setShowMyTasks: (value) => set({ showMyTasks: value }),
      setDiffSelectedFileOnly: (value) => set({ diffSelectedFileOnly: value }),
      setStreamWidthShare: (value) => set({ streamWidthShare: value }),
      setChangesDefaultComparison: (value) => set({ changesDefaultComparison: value }),
      rememberGithubHost: (host) => set({ githubHost: host }),
      rememberGithubPlace: (host, organisation, team) =>
        set((state) => ({
          githubPlaces: { ...state.githubPlaces, [host]: { organisation, team } },
        })),
      rememberStandardsPlace: (serverId, repoRoot) =>
        set({ standardsPlace: { serverId, repoRoot } }),
      rememberRepository: (repositoryId) => set({ lastRepositoryId: repositoryId }),
      dismissInstallCard: () => set({ installCardDismissed: true }),
      setFooterPanelCollapsed: (value) => set({ footerPanelCollapsed: value }),
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
        installCardDismissed: state.installCardDismissed ?? false,
        footerPanelCollapsed: state.footerPanelCollapsed ?? false,
        localInPlaceOnTrunk: state.localInPlaceOnTrunk ?? false,
        showMyTasks: state.showMyTasks ?? true,
        diffSelectedFileOnly: state.diffSelectedFileOnly ?? false,
        streamWidthShare: state.streamWidthShare ?? null,
        changesDefaultComparison: state.changesDefaultComparison ?? "all",
      }),
      version: 1,
    },
  ),
);
