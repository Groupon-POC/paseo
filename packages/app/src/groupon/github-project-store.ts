// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Mac the From GitHub sheet is open for, and the repository New workspace asked it to clone.

import { useCallback } from "react";
import { create } from "zustand";
import { useAddProjectFlowStore } from "@/stores/add-project-flow-store";
import type { FolderMode } from "./github-project-model";

/**
 * A repository already chosen: New workspace's "Clone it on <Mac>" opens the sheet at the folder
 * step of it, on its host, and after the clone the sheet closes back to New workspace, which picks
 * the new checkout up on that Mac (no navigation, so the person's draft stays). "It is already on
 * <Mac>" opens the same step on its other way (`mode` "existing"): add the checkout already there.
 */
export interface GithubProjectPrefill {
  host: string;
  fullName: string;
  mode?: FolderMode;
}

/** The From GitHub sheet's request: the Mac the repository is downloaded to. */
export interface GithubProjectRequest {
  id: number;
  serverId: string;
  prefill: GithubProjectPrefill | null;
}

interface GithubProjectState {
  request: GithubProjectRequest | null;
  open: (serverId: string, prefill?: GithubProjectPrefill) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useGithubProjectStore = create<GithubProjectState>((set) => ({
  request: null,
  open: (serverId, prefill) =>
    set({ request: { id: nextRequestId++, serverId, prefill: prefill ?? null } }),
  close: () => set({ request: null }),
}));

/**
 * Opens From GitHub on the given Mac, or first on its host step: Add project's list of the
 * person's Macs (`add-to-mac-model.ts`), this Mac first even while its hand is not running, so a
 * repository can be cloned onto any of them.
 */
export function useOpenGithubProject(): (serverId?: string) => void {
  const open = useGithubProjectStore((state) => state.open);
  const openAddProject = useAddProjectFlowStore((state) => state.open);
  return useCallback(
    (serverId?: string) => {
      if (serverId) {
        open(serverId);
        return;
      }
      openAddProject(undefined, "github");
    },
    [open, openAddProject],
  );
}
