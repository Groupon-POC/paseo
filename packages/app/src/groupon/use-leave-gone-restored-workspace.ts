// Added for Groupon Desk (fork of Paseo, Apache-2.0): the workspace screen leaves for home when a relaunch reopened a workspace that is gone.
import { useRouter, type Href } from "expo-router";
import { useEffect } from "react";
import { buildOpenProjectRoute } from "@/utils/host-routes";
import { restoredWorkspaceVerdict } from "./restored-workspace";

/** The rule is `restored-workspace.ts`; this only replaces the route with the home page. */
export function useLeaveGoneRestoredWorkspace(input: {
  serverId: string;
  workspaceId: string;
  stateKind: string;
}): void {
  const router = useRouter();
  const { serverId, workspaceId, stateKind } = input;
  useEffect(() => {
    if (restoredWorkspaceVerdict({ serverId, workspaceId, stateKind }) === "leave") {
      router.replace(buildOpenProjectRoute() as Href);
    }
  }, [router, serverId, workspaceId, stateKind]);
}
