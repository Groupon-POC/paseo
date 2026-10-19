// Added for Groupon Desk (fork of Paseo, Apache-2.0): Groupon Desk's own app preferences on this device.

/**
 * Preferences the fork adds, kept on this device beside Paseo's own. Today one: whether to be
 * reminded to set up worktree scripts for a project without a repository file. Off by default:
 * the owner wants no such card for anyone unless they ask for it (2026-10-19).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

const GrouponPreferencesSchema = z.object({
  remindWorktreeScripts: z.boolean(),
});

type GrouponPreferences = z.infer<typeof GrouponPreferencesSchema>;

interface GrouponPreferencesState extends GrouponPreferences {
  setRemindWorktreeScripts: (value: boolean) => void;
}

export const DEFAULT_GROUPON_PREFERENCES: GrouponPreferences = { remindWorktreeScripts: false };

export const useGrouponPreferences = create<GrouponPreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_GROUPON_PREFERENCES,
      setRemindWorktreeScripts: (value) => set({ remindWorktreeScripts: value }),
    }),
    {
      name: "groupon-desk-preferences",
      storage: createValidatedPersistStorage(AsyncStorage, GrouponPreferencesSchema),
      partialize: (state) => ({ remindWorktreeScripts: state.remindWorktreeScripts }),
      version: 1,
    },
  ),
);
