// Changed for Groupon Desk (fork of Paseo, Apache-2.0): notes the workspace a relaunch reopens, so the workspace screen goes home when it is gone (`groupon/restored-workspace.ts`).
import { Redirect } from "expo-router";
import { useHostRouteServerId } from "@/navigation/host-route-context";
import {
  resolveHostIndexRoute,
  resolveWorkspaceSelectionStatus,
} from "@/navigation/host-runtime-bootstrap";
import { StartupSplashScreen } from "@/screens/startup-splash-screen";
import { useHasHydratedWorkspaces, useWorkspaceExists } from "@/stores/session-store-hooks";
import {
  useIsLastWorkspaceSelectionHydrated,
  useLastWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { noteRestoredWorkspace } from "@/groupon/restored-workspace";
import { buildOpenProjectRoute } from "@/utils/host-routes";

export default function HostIndexRoute() {
  const serverId = useHostRouteServerId();
  const workspaceSelection = useLastWorkspaceSelection();
  const isWorkspaceSelectionLoaded = useIsLastWorkspaceSelectionHydrated();
  const workspaceSelectionWorkspaceId =
    workspaceSelection?.serverId === serverId ? workspaceSelection.workspaceId : null;
  const hasHydratedWorkspaces = useHasHydratedWorkspaces(serverId);
  const workspaceSelectionExists = useWorkspaceExists(serverId, workspaceSelectionWorkspaceId);

  if (!serverId || !isWorkspaceSelectionLoaded) {
    return <StartupSplashScreen />;
  }

  const href = resolveHostIndexRoute({
    serverId,
    workspaceSelection,
    workspaceSelectionStatus: resolveWorkspaceSelectionStatus({
      hasHydratedWorkspaces,
      workspaceExists: workspaceSelectionExists,
    }),
  });
  // Reopening the last workspace on its own: the workspace screen goes home if it is gone.
  if (workspaceSelection?.serverId === serverId && href !== buildOpenProjectRoute()) {
    noteRestoredWorkspace(workspaceSelection);
  }
  return <Redirect href={href} />;
}
