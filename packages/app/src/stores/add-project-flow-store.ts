// Changed for Groupon Desk (fork of Paseo, Apache-2.0): the flow also serves as From GitHub's host step (`intent`).
import { create } from "zustand";
import type { AddToMacIntent } from "@/groupon/add-to-mac-model";

export interface AddProjectFlowRequest {
  id: number;
  preferredHostId?: string;
  /** Groupon Desk: `github` opens the list of Macs as From GitHub's host step. */
  intent?: AddToMacIntent;
}

interface AddProjectFlowStoreState {
  request: AddProjectFlowRequest | null;
  open: (preferredHostId?: string, intent?: AddToMacIntent) => void;
  close: () => void;
}

let nextRequestId = 1;

export const useAddProjectFlowStore = create<AddProjectFlowStoreState>((set) => ({
  request: null,
  open: (preferredHostId, intent) => {
    set({
      request: {
        id: nextRequestId++,
        ...(preferredHostId ? { preferredHostId } : {}),
        ...(intent ? { intent } : {}),
      },
    });
  },
  close: () => set({ request: null }),
}));
