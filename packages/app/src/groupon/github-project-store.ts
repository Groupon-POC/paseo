// Added for Groupon Desk (fork of Paseo, Apache-2.0): which Mac the From GitHub sheet is open for.

import { useCallback } from "react";
import { create } from "zustand";
import { useHostChooser } from "@/hosts/host-chooser";

/** The From GitHub sheet's request: the Mac the repository is downloaded to. */
export interface GithubProjectRequest {
  id: number;
  serverId: string;
}

interface GithubProjectState {
  request: GithubProjectRequest | null;
  open: (serverId: string) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useGithubProjectStore = create<GithubProjectState>((set) => ({
  request: null,
  open: (serverId) => set({ request: { id: nextRequestId++, serverId } }),
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
      chooseHost({ title: "Download to which Mac?", onChooseHost: open });
    },
    [chooseHost, open],
  );
}
