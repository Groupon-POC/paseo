// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Mac the From GitHub sheet is open for, and the repository New workspace asked it to clone.

import { useCallback } from "react";
import { create } from "zustand";
import { useHostChooser } from "@/hosts/host-chooser";

/**
 * A repository already chosen: New workspace's "Clone it on <Mac>" opens the sheet at the folder
 * step of it, on its host, and after the clone the sheet closes back to New workspace, which picks
 * the new checkout up on that Mac (no navigation, so the person's draft stays).
 */
export interface GithubProjectPrefill {
  host: string;
  fullName: string;
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

/** Opens From GitHub on the given Mac, or asks which Mac first when there are several. */
export function useOpenGithubProject(): (serverId?: string) => void {
  const chooseHost = useHostChooser();
  const open = useGithubProjectStore((state) => state.open);
  return useCallback(
    (serverId?: string) => {
      if (serverId) {
        open(serverId);
        return;
      }
      chooseHost({ title: "Download to which Mac?", onChooseHost: (id) => open(id) });
    },
    [chooseHost, open],
  );
}
